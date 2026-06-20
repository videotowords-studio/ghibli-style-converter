export interface Env {
  DB?: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_IMAGE_MODEL?: string;
  GEMINI_TEXT_MODEL?: string;
  ALLOWED_ORIGIN?: string;
  SESSION_SECRET?: string;
}

type Session = {
  userId: number;
  email: string;
};

type UserRow = {
  id: number;
  email: string;
  credits: number;
  last_checkin_date?: string | null;
};

type GenerationKind = "image" | "essay" | "dream" | "lottery";

type AuthResult =
  | {
      db: D1Database;
      session: Session;
      user: UserRow;
    }
  | {
      response: Response;
    };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_IMAGE_CHARS = 1_500_000;
const MAX_TEXT_INPUT_CHARS = 1200;
const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const INITIAL_CREDITS = 100;
const DAILY_LOGIN_BONUS = 5;
const IMAGE_COST = 110;
const ESSAY_COST = 5;
const DREAM_COST = 5;
const LOTTERY_COST = 2;
const PBKDF2_ITERATIONS = 100_000;
const SESSION_COOKIE = "ghibli_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

const STYLE_PROMPT = [
  "Convert the uploaded image into a warm, hand-painted Japanese animated film still.",
  "Keep the main subject, pose, framing, and important identity details recognizable.",
  "Use soft watercolor-like backgrounds, gentle natural lighting, expressive but tasteful character details,",
  "clean ink edges, lush environmental color, and a cozy cinematic mood.",
  "Do not add text, logos, borders, or watermarks. Return one finished image."
].join(" ");

function corsHeaders(request: Request, env: Env) {
  const requestOrigin = request.headers.get("Origin") || "*";
  const origin = env.ALLOWED_ORIGIN || requestOrigin;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}

function jsonResponse(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
  headers: HeadersInit = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env),
      ...headers
    }
  });
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array | string) {
  const data =
    typeof bytes === "string"
      ? encoder.encode(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
  let binary = "";

  for (let index = 0; index < data.length; index += 0x8000) {
    binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));

  return base64UrlEncode(digest);
}

function timingSafeEqual(first: string, second: string) {
  const firstBytes = encoder.encode(first);
  const secondBytes = encoder.encode(second);

  if (firstBytes.length !== secondBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < firstBytes.length; index += 1) {
    diff |= firstBytes[index] ^ secondBytes[index];
  }

  return diff === 0;
}

function getCookie(request: Request, name: string) {
  const cookies = request.headers.get("Cookie") || "";

  return cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function getSessionToken(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return getCookie(request, SESSION_COOKIE);
}

function createCookie(value: string, maxAge = SESSION_TTL_SECONDS) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${maxAge}`
  ];

  return parts.join("; ");
}

function clearCookie() {
  return createCookie("", 0);
}

function getSessionSecret(env: Env) {
  return env.SESSION_SECRET || env.GEMINI_API_KEY;
}

async function signSession(payload: { userId: number; email: string; exp: number }, env: Env) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await sha256(`${body}.${getSessionSecret(env)}`);

  return `${body}.${signature}`;
}

async function readSession(request: Request, env: Env) {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = await sha256(`${body}.${getSessionSecret(env)}`);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body))
    ) as { userId?: number; email?: string; exp?: number };

    if (!payload.userId || !payload.email || !payload.exp) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email
    };
  } catch {
    return null;
  }
}

async function hashPassword(password: string, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS
    },
    key,
    256
  );

  return {
    salt,
    passwordHash: base64UrlEncode(bits)
  };
}

async function verifyPassword(password: string, salt: string, passwordHash: string) {
  const nextHash = await hashPassword(password, salt);

  return timingSafeEqual(nextHash.passwordHash, passwordHash);
}

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizePassword(password: unknown) {
  return typeof password === "string" ? password : "";
}

function validateCredentials(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "请输入正确的邮箱。";
  }

  if (password.length < 8) {
    return "密码至少需要 8 位。";
  }

  return "";
}

async function columnExists(db: D1Database, table: string, column: string) {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();

  return (result.results || []).some((row) => row.name === column);
}

async function ensureSchema(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT ${INITIAL_CREDITS},
      last_checkin_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  if (!(await columnExists(db, "users", "credits"))) {
    await db.prepare(
      `ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT ${INITIAL_CREDITS}`
    ).run();
  }

  if (!(await columnExists(db, "users", "last_checkin_date"))) {
    await db.prepare("ALTER TABLE users ADD COLUMN last_checkin_date TEXT").run();
  }

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      cost INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  ).run();

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"
  ).run();

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_generations_user_created ON generations(user_id, created_at DESC)"
  ).run();

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes(created_at DESC)"
  ).run();
}

function missingDatabaseResponse(request: Request, env: Env) {
  return jsonResponse(
    request,
    env,
    { error: "注册登录服务还没有绑定 Cloudflare D1 数据库。" },
    500
  );
}

function userPayload(user: UserRow) {
  return {
    email: user.email,
    credits: user.credits,
    lastCheckinDate: user.last_checkin_date || null
  };
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function applyDailyCheckin(db: D1Database, user: UserRow) {
  const today = todayKey();

  if (user.last_checkin_date === today) {
    return {
      user,
      message: "欢迎回来"
    };
  }

  await db.prepare(
    "UPDATE users SET credits = credits + ?, last_checkin_date = ? WHERE id = ?"
  )
    .bind(DAILY_LOGIN_BONUS, today, user.id)
    .run();

  return {
    user: {
      ...user,
      credits: user.credits + DAILY_LOGIN_BONUS,
      last_checkin_date: today
    },
    message: `欢迎回来，已赠送 ${DAILY_LOGIN_BONUS} 积分`
  };
}

async function respondWithSession(
  request: Request,
  env: Env,
  user: UserRow,
  status = 200,
  message?: string
) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signSession({ userId: user.id, email: user.email, exp }, env);

  return jsonResponse(
    request,
    env,
    { user: userPayload(user), token, message },
    status,
    {
      "Set-Cookie": createCookie(token)
    }
  );
}

async function parseJsonBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function register(request: Request, env: Env) {
  const db = env.DB;

  if (!db) {
    return missingDatabaseResponse(request, env);
  }

  await ensureSchema(db);

  const body = await parseJsonBody(request);

  if (!body) {
    return jsonResponse(request, env, { error: "请求格式不正确。" }, 400);
  }

  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);
  const credentialError = validateCredentials(email, password);

  if (credentialError) {
    return jsonResponse(request, env, { error: credentialError }, 400);
  }

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number }>();

  if (existing) {
    return jsonResponse(request, env, { error: "这个邮箱已经注册，请直接登录。" }, 409);
  }

  const { salt, passwordHash } = await hashPassword(password);
  const result = await db.prepare(
    "INSERT INTO users (email, password_hash, password_salt, credits) VALUES (?, ?, ?, ?)"
  )
    .bind(email, passwordHash, salt, INITIAL_CREDITS)
    .run();

  return respondWithSession(
    request,
    env,
    {
      id: Number(result.meta.last_row_id),
      email,
      credits: INITIAL_CREDITS,
      last_checkin_date: null
    },
    201,
    `注册成功，已赠送 ${INITIAL_CREDITS} 积分`
  );
}

async function login(request: Request, env: Env) {
  const db = env.DB;

  if (!db) {
    return missingDatabaseResponse(request, env);
  }

  await ensureSchema(db);

  const body = await parseJsonBody(request);

  if (!body) {
    return jsonResponse(request, env, { error: "请求格式不正确。" }, 400);
  }

  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);
  const credentialError = validateCredentials(email, password);

  if (credentialError) {
    return jsonResponse(request, env, { error: credentialError }, 400);
  }

  const user = await db.prepare(
    "SELECT id, email, password_hash, password_salt, credits, last_checkin_date FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{
      id: number;
      email: string;
      password_hash: string;
      password_salt: string;
      credits: number;
      last_checkin_date: string | null;
    }>();

  if (
    !user ||
    !(await verifyPassword(password, user.password_salt, user.password_hash))
  ) {
    return jsonResponse(request, env, { error: "邮箱或密码不正确。" }, 401);
  }

  const checkedIn = await applyDailyCheckin(db, {
    id: user.id,
    email: user.email,
    credits: user.credits,
    last_checkin_date: user.last_checkin_date
  });

  return respondWithSession(request, env, checkedIn.user, 200, checkedIn.message);
}

async function getAuthedUser(request: Request, env: Env): Promise<AuthResult> {
  const db = env.DB;

  if (!db) {
    return {
      response: missingDatabaseResponse(request, env)
    };
  }

  await ensureSchema(db);

  const session = await readSession(request, env);

  if (!session) {
    return {
      response: jsonResponse(request, env, { error: "请先登录。" }, 401)
    };
  }

  const user = await db.prepare(
    "SELECT id, email, credits, last_checkin_date FROM users WHERE id = ? AND email = ?"
  )
    .bind(session.userId, session.email)
    .first<UserRow>();

  if (!user) {
    return {
      response: jsonResponse(request, env, { error: "登录状态已失效，请重新登录。" }, 401)
    };
  }

  return {
    db,
    session,
    user
  };
}

async function me(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  return jsonResponse(request, env, { user: userPayload(auth.user) });
}

function logout(request: Request, env: Env) {
  return jsonResponse(
    request,
    env,
    { ok: true },
    200,
    {
      "Set-Cookie": clearCookie()
    }
  );
}

function getGeminiErrorMessage(status: number, message: string) {
  if (status === 401 || status === 403) {
    return "生成服务暂时不可用，请联系站长检查配置。";
  }

  if (status === 404) {
    return "生成服务暂时不可用，请联系站长检查配置。";
  }

  if (status === 429) {
    return "生成服务当前额度不足或请求过于频繁，请稍后再试。";
  }

  return message || "生成服务返回错误。";
}

function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return `${fallback}，请稍后再试。`;
  }

  return fallback;
}

function insufficientCreditsResponse(request: Request, env: Env, credits: number, cost: number) {
  return jsonResponse(
    request,
    env,
    { error: `积分不足。本次需要 ${cost} 积分，当前剩余 ${credits} 积分，请联系站长充值。` },
    402
  );
}

async function chargeCredits(db: D1Database, userId: number, cost: number) {
  await db.prepare("UPDATE users SET credits = credits - ? WHERE id = ?")
    .bind(cost, userId)
    .run();

  const user = await db.prepare("SELECT id, email, credits FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();

  return user?.credits ?? 0;
}

async function recordGeneration(
  db: D1Database,
  userId: number,
  kind: GenerationKind,
  title: string,
  input: string,
  output: string | null,
  cost: number
) {
  await db.prepare(
    "INSERT INTO generations (user_id, kind, title, input, output, cost) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(userId, kind, title, input, output, cost)
    .run();
}

function isUploadedFile(value: File | string | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "type" in value &&
    "size" in value
  );
}

async function transformImage(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  if (auth.user.credits < IMAGE_COST) {
    return insufficientCreditsResponse(request, env, auth.user.credits, IMAGE_COST);
  }

  if (!env.GEMINI_API_KEY) {
    return jsonResponse(request, env, { error: "生成服务暂时不可用，请联系站长检查配置。" }, 500);
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!isUploadedFile(image)) {
    return jsonResponse(request, env, { error: "请上传一张图片。" }, 400);
  }

  if (!image.type.startsWith("image/")) {
    return jsonResponse(request, env, { error: "文件格式不正确，请上传图片文件。" }, 400);
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return jsonResponse(request, env, { error: "图片不能超过 8MB。" }, 400);
  }

  const model = env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const imageBytes = await image.arrayBuffer();
  let binaryImage = "";
  const imageArray = new Uint8Array(imageBytes);

  for (let index = 0; index < imageArray.length; index += 0x8000) {
    binaryImage += String.fromCharCode(...imageArray.subarray(index, index + 0x8000));
  }

  const imageBase64 = btoa(binaryImage);

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: STYLE_PROMPT },
              {
                inlineData: {
                  mimeType: image.type,
                  data: imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    }
  );

  const payload = (await geminiResponse.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: {
            data?: string;
            mimeType?: string;
          };
        }>;
      };
    }>;
  };

  if (!geminiResponse.ok) {
    return jsonResponse(
      request,
      env,
      {
        error: getGeminiErrorMessage(
          geminiResponse.status,
          payload.error?.message || ""
        )
      },
      500
    );
  }

  const parts = payload.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    const text = parts.map((part) => part.text).filter(Boolean).join("\n");

    return jsonResponse(
      request,
      env,
      { error: text || "生成服务没有返回图片。请换一张图片，或稍后再试。" },
      502
    );
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  const imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;
  const storedOutput =
    imageUrl.length <= MAX_STORED_IMAGE_CHARS
      ? imageUrl
      : "图片结果较大，记录已保留生成信息；请在本次生成页及时下载结果。";
  const credits = await chargeCredits(auth.db, auth.user.id, IMAGE_COST);
  const title = image.name || "图片转绘";

  await recordGeneration(
    auth.db,
    auth.user.id,
    "image",
    title,
    `${title} · ${Math.ceil(image.size / 1024)}KB`,
    storedOutput,
    IMAGE_COST
  );

  return jsonResponse(request, env, {
    mimeType,
    image: imageUrl,
    credits
  });
}

async function generateText(env: Env, prompt: string, maxOutputTokens = 4096) {
  const model = env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.82,
          maxOutputTokens
        }
      })
    }
  );

  const payload = (await geminiResponse.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  if (!geminiResponse.ok) {
    throw new Error(
      getGeminiErrorMessage(geminiResponse.status, payload.error?.message || "")
    );
  }

  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildEssayPrompt(input: string) {
  return [
    "你是一位高考语文作文阅卷经验丰富的写作老师。",
    "请把用户给出的主题、观点或素材，扩展成一篇中文文章。",
    "硬性要求：输出一篇完整文章，不少于 800 个中文汉字，不要中途停止。",
    "质量要求：达到高考优秀作文水平；中心明确；结构完整；语言凝练有文采；论证或叙述自然；不要空泛堆砌。",
    "结构要求：第一行写标题，正文至少 6 个自然段，有清楚开头、展开和结尾。",
    "不要写任何使用说明，不要出现 AI 自述。",
    `用户输入：${input}`
  ].join("\n");
}

function buildDreamPrompt(input: string) {
  return [
    "你是一位温和、有洞察力的解梦顾问。",
    "请根据用户描述的梦境，进行周公解梦风格的解释，但不要做迷信恐吓，也不要给医疗、法律、投资等高风险建议。",
    "输出结构：梦境概述、可能象征、现实提醒、可以怎么处理。",
    "语言要亲切、具体、让用户觉得被理解。",
    `用户梦境：${input}`
  ].join("\n");
}

async function writeEssay(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  if (auth.user.credits < ESSAY_COST) {
    return insufficientCreditsResponse(request, env, auth.user.credits, ESSAY_COST);
  }

  if (!env.GEMINI_API_KEY) {
    return jsonResponse(request, env, { error: "创作服务暂时不可用，请联系站长检查配置。" }, 500);
  }

  const body = await parseJsonBody(request);
  const input = typeof body?.input === "string" ? body.input.trim() : "";

  if (input.length < 4) {
    return jsonResponse(request, env, { error: "请输入更完整的主题或素材。" }, 400);
  }

  if (input.length > MAX_TEXT_INPUT_CHARS) {
    return jsonResponse(
      request,
      env,
      { error: `输入内容不能超过 ${MAX_TEXT_INPUT_CHARS} 个字。` },
      400
    );
  }

  const article = await generateText(env, buildEssayPrompt(input), 4096);

  if (!article) {
    return jsonResponse(request, env, { error: "创作服务没有返回文章，请稍后再试。" }, 502);
  }

  const title = article
    .split("\n")
    .find((line) => line.trim())
    ?.replace(/^#+\s*/, "")
    .slice(0, 60) || "作文宝";
  const credits = await chargeCredits(auth.db, auth.user.id, ESSAY_COST);

  await recordGeneration(
    auth.db,
    auth.user.id,
    "essay",
    title,
    input,
    article,
    ESSAY_COST
  );

  return jsonResponse(request, env, {
    article,
    credits
  });
}

async function interpretDream(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  if (auth.user.credits < DREAM_COST) {
    return insufficientCreditsResponse(request, env, auth.user.credits, DREAM_COST);
  }

  if (!env.GEMINI_API_KEY) {
    return jsonResponse(request, env, { error: "解读服务暂时不可用，请联系站长检查配置。" }, 500);
  }

  const body = await parseJsonBody(request);
  const input = typeof body?.input === "string" ? body.input.trim() : "";

  if (input.length < 4) {
    return jsonResponse(request, env, { error: "请输入更完整的梦境内容。" }, 400);
  }

  if (input.length > MAX_TEXT_INPUT_CHARS) {
    return jsonResponse(
      request,
      env,
      { error: `输入内容不能超过 ${MAX_TEXT_INPUT_CHARS} 个字。` },
      400
    );
  }

  const dream = await generateText(env, buildDreamPrompt(input), 1800);

  if (!dream) {
    return jsonResponse(request, env, { error: "解读服务没有返回内容，请稍后再试。" }, 502);
  }

  const title = `梦境解读：${input.slice(0, 24)}`;
  const credits = await chargeCredits(auth.db, auth.user.id, DREAM_COST);

  await recordGeneration(
    auth.db,
    auth.user.id,
    "dream",
    title,
    input,
    dream,
    DREAM_COST
  );

  return jsonResponse(request, env, {
    dream,
    credits
  });
}

async function postWish(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJsonBody(request);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (content.length < 2) {
    return jsonResponse(request, env, { error: "请写下你的心愿。" }, 400);
  }

  if (content.length > 200) {
    return jsonResponse(request, env, { error: "心愿不能超过 200 个字。" }, 400);
  }

  await auth.db.prepare(
    "INSERT INTO wishes (user_id, email, content) VALUES (?, ?, ?)"
  )
    .bind(auth.user.id, auth.user.email, content)
    .run();

  return listWishes(request, env);
}

async function listWishes(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  const result = await auth.db.prepare(
    `SELECT id, email, content, created_at
     FROM wishes
     ORDER BY id DESC
     LIMIT 80`
  ).all<{
    id: number;
    email: string;
    content: string;
    created_at: string;
  }>();

  return jsonResponse(request, env, {
    wishes: result.results || [],
    credits: auth.user.credits
  });
}

async function drawLottery(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  if (auth.user.credits < LOTTERY_COST) {
    return insufficientCreditsResponse(request, env, auth.user.credits, LOTTERY_COST);
  }

  const prize = crypto.getRandomValues(new Uint32Array(1))[0] % 9 + 1;
  await auth.db.prepare("UPDATE users SET credits = credits - ? + ? WHERE id = ?")
    .bind(LOTTERY_COST, prize, auth.user.id)
    .run();

  const user = await auth.db.prepare("SELECT id, email, credits, last_checkin_date FROM users WHERE id = ?")
    .bind(auth.user.id)
    .first<UserRow>();
  const credits = user?.credits ?? auth.user.credits - LOTTERY_COST + prize;
  const title = `神秘积分抽奖：获得 ${prize} 积分`;

  await recordGeneration(
    auth.db,
    auth.user.id,
    "lottery",
    title,
    "试试你的手气吧",
    title,
    LOTTERY_COST
  );

  return jsonResponse(request, env, {
    prize,
    credits
  });
}

async function listHistory(request: Request, env: Env) {
  const auth = await getAuthedUser(request, env);

  if ("response" in auth) {
    return auth.response;
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 50);
  const result = await auth.db.prepare(
    `SELECT id, kind, title, input, output, cost, created_at
     FROM generations
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT ?`
  )
    .bind(auth.user.id, limit)
    .all<{
      id: number;
      kind: GenerationKind;
      title: string;
      input: string;
      output: string | null;
      cost: number;
      created_at: string;
    }>();

  return jsonResponse(request, env, {
    history: result.results || [],
    credits: auth.user.credits
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env)
      });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        return await register(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "注册失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        return await login(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "登录失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return me(request, env);
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return logout(request, env);
    }

    if (url.pathname === "/api/transform" && request.method === "POST") {
      try {
        return await transformImage(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "图片转换失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/write" && request.method === "POST") {
      try {
        return await writeEssay(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "作文生成失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/dream" && request.method === "POST") {
      try {
        return await interpretDream(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "解梦失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/wishes" && request.method === "GET") {
      try {
        return await listWishes(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "心愿读取失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/wishes" && request.method === "POST") {
      try {
        return await postWish(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "心愿提交失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/lottery" && request.method === "POST") {
      try {
        return await drawLottery(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "抽奖失败") },
          500
        );
      }
    }

    if (url.pathname === "/api/history" && request.method === "GET") {
      try {
        return await listHistory(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(
          request,
          env,
          { error: getAuthErrorMessage(error, "记录读取失败") },
          500
        );
      }
    }

    return jsonResponse(request, env, { error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;
