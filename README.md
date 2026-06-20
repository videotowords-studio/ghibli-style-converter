# Ghibli Style Converter

一个本地可运行、之后可推到 GitHub 的 Next.js 网站。用户上传图片后，服务端调用 Gemini 图片编辑能力生成温暖手绘动画质感的结果图，并支持下载。

## 本地运行

1. 安装依赖：

```bash
pnpm install
```

2. 创建环境变量文件：

```bash
cp .env.example .env.local
```

3. 把你的 Gemini API key 填进 `.env.local`：

```bash
GEMINI_API_KEY=你的_key
```

4. 启动：

```bash
pnpm dev
```

打开 `http://localhost:3000`。

## 如何获取 Gemini API key

1. 打开 [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)。
2. 使用你的 Google 账号登录并接受条款。
3. 点击 `Create API key`。
4. 选择或创建一个 Google Cloud 项目。
5. 复制生成的 key，填入 `.env.local` 的 `GEMINI_API_KEY`。

Google 官方文档说明：每个 Gemini API key 都绑定到一个 Google Cloud 项目；2026 年 6 月 19 日起，Gemini API 会拒绝不受限制的 standard key；2026 年 9 月起 standard key 会被拒绝，应该迁移到 auth key。Google AI Studio 现在新建的 key 默认就是 auth key。不要把 `.env.local` 或任何真实 key 提交到 GitHub。

## 上线到 GitHub/部署平台

GitHub 只放代码，不放密钥。部署到 Vercel、Render、Railway 等平台时，在平台的 Environment Variables 里设置：

```bash
GEMINI_API_KEY=你的_key
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

纯 GitHub Pages 不能安全保存服务器密钥，因此不适合直接部署这个项目。推荐使用 Vercel 或其他支持 Next.js API routes 的平台。

如果前端和后端分开部署，例如前端在 Cloudflare Pages、后端在 Cloudflare Workers，需要在前端环境变量里设置：

```bash
NEXT_PUBLIC_API_BASE=https://你的-worker.workers.dev
```

## 技术说明

- 前端：Next.js App Router + React
- 后端：`/api/transform` 接收上传图片，服务端调用 `@google/genai`
- 默认模型：`gemini-2.5-flash-image`
- 上传限制：仅图片，最大 8MB
