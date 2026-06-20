export interface Env {
  DB?: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_IMAGE_MODEL?: string;
  ALLOWED_ORIGIN?: string;
  SESSION_SECRET?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MODEL = "gemini-2.5-flash-image";
const PBKDF2_ITERATIONS = 210_000;
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

async function ensureSchema(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"
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

async function respondWithSession(
  request: Request,
  env: Env,
  user: { id: number; email: string },
  status = 200
) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signSession({ userId: user.id, email: user.email, exp }, env);

  return jsonResponse(
    request,
    env,
    { user: { email: user.email }, token },
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
    "INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)"
  )
    .bind(email, passwordHash, salt)
    .run();

  return respondWithSession(
    request,
    env,
    { id: Number(result.meta.last_row_id), email },
    201
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
    "SELECT id, email, password_hash, password_salt FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{
      id: number;
      email: string;
      password_hash: string;
      password_salt: string;
    }>();

  if (
    !user ||
    !(await verifyPassword(password, user.password_salt, user.password_hash))
  ) {
    return jsonResponse(request, env, { error: "邮箱或密码不正确。" }, 401);
  }

  return respondWithSession(request, env, { id: user.id, email: user.email });
}

async function me(request: Request, env: Env) {
  const session = await readSession(request, env);

  if (!session) {
    return jsonResponse(request, env, { user: null }, 401);
  }

  return jsonResponse(request, env, { user: { email: session.email } });
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
    return "Gemini key 无效、权限不足，或没有启用 Gemini API。";
  }

  if (status === 404) {
    return "当前 Gemini 图片模型不可用，请检查 GEMINI_IMAGE_MODEL。";
  }

  if (status === 429) {
    return "Gemini 当前额度不足或请求过于频繁，请稍后再试。";
  }

  return message || "Gemini API 返回错误。";
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
  const session = await readSession(request, env);

  if (!session) {
    return jsonResponse(request, env, { error: "请先登录后再开始转绘。" }, 401);
  }

  if (!env.GEMINI_API_KEY) {
    return jsonResponse(request, env, { error: "Worker 还没有配置 GEMINI_API_KEY。" }, 500);
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

  const model = env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
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
      { error: text || "Gemini 没有返回图片。请换一张图片，或稍后再试。" },
      502
    );
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return jsonResponse(request, env, {
    mimeType,
    image: `data:${mimeType};base64,${imagePart.inlineData.data}`
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
        return jsonResponse(request, env, { error: "注册失败，请稍后再试。" }, 500);
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        return await login(request, env);
      } catch (error) {
        console.error(error);
        return jsonResponse(request, env, { error: "登录失败，请稍后再试。" }, 500);
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
          { error: "图片转换失败，请稍后再试。" },
          500
        );
      }
    }

    return jsonResponse(request, env, { error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;
