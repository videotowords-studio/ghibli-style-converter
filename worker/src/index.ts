export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_IMAGE_MODEL?: string;
  ALLOWED_ORIGIN?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MODEL = "gemini-2.5-flash-image";
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(
  request: Request,
  env: Env,
  body: unknown,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env)
    }
  });
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
