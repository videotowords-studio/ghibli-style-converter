import { ApiError, GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { ProxyAgent, setGlobalDispatcher } from "undici";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MODEL = "gemini-3.1-flash-image";

const STYLE_PROMPT = [
  "Convert the uploaded image into a warm, hand-painted Japanese animated film still.",
  "Keep the main subject, pose, framing, and important identity details recognizable.",
  "Use soft watercolor-like backgrounds, gentle natural lighting, expressive but tasteful character details,",
  "clean ink edges, lush environmental color, and a cozy cinematic mood.",
  "Do not add text, logos, borders, or watermarks. Return one finished image."
].join(" ");

type GeminiPart = {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

function createGoogleClient(apiKey: string) {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) {
    return new GoogleGenAI({ apiKey });
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));

  return new GoogleGenAI({ apiKey });
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Gemini key 无效、权限不足，或没有启用 Gemini API。";
    }

    if (error.status === 404) {
      return "当前 Gemini 图片模型不可用，请检查 GEMINI_IMAGE_MODEL。";
    }

    if (error.status === 429) {
      return "Gemini 当前额度不足或请求过于频繁，请稍后再试。";
    }

    return `Gemini API 返回错误：${error.message}`;
  }

  if (error instanceof TypeError && error.message === "fetch failed") {
    return "服务器无法连接 Gemini API，请检查本机/部署环境是否能访问 generativelanguage.googleapis.com。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "图片转换失败，请稍后再试。";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "服务器还没有配置 GEMINI_API_KEY。" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "请上传一张图片。" },
        { status: 400 }
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "文件格式不正确，请上传图片文件。" },
        { status: 400 }
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "图片不能超过 8MB。" },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const ai = createGoogleClient(apiKey);
    const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;

    const response = await ai.models.generateContent({
      model,
      config: {
        responseModalities: ["TEXT", "IMAGE"]
      },
      contents: [
        { text: STYLE_PROMPT },
        {
          inlineData: {
            mimeType: image.type,
            data: imageBuffer.toString("base64")
          }
        }
      ]
    });

    const parts = (response.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
    const imagePart = parts.find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      const text = parts.map((part) => part.text).filter(Boolean).join("\n");

      return NextResponse.json(
        {
          error:
            text ||
            "Gemini 没有返回图片。请换一张图片，或稍后再试。"
        },
        { status: 502 }
      );
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";

    return NextResponse.json({
      mimeType,
      image: `data:${mimeType};base64,${imagePart.inlineData.data}`
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
