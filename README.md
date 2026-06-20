# Ghibli Style Converter

一个本地可运行、之后可推到 GitHub 和 Cloudflare 的创作网站。用户注册后获得 100 积分，可以使用图片转绘和高考水平文章撰写，并查看自己的生成记录。

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

Cloudflare Pages 前端构建配置：

```bash
Build command: pnpm pages:build
Build output directory: out
Root directory: /
```

Cloudflare Worker 后端需要配置：

```bash
GEMINI_API_KEY=你的_key
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_TEXT_MODEL=gemini-2.5-flash
SESSION_SECRET=一段随机长字符串
```

注册登录服务使用 Cloudflare D1。创建 D1 数据库后，在 Worker 里添加 D1 binding：

```bash
Binding name: DB
Database: 你创建的 D1 数据库
```

Worker 会在第一次注册、登录或生成时自动创建/更新 `users` 和 `generations` 表。

积分规则：

```text
新用户注册：赠送 100 积分
图片转绘：每次扣 10 积分
文案撰写：每次扣 5 积分
积分不足：提示联系站长充值
```

## 技术说明

- 前端：Next.js App Router + React
- 后端：Cloudflare Worker 提供登录注册、图片转绘、文章撰写和生成记录接口
- 数据库：Cloudflare D1 存储邮箱账号、密码哈希、积分和生成记录
- 默认模型：`gemini-2.5-flash-image`
- 上传限制：仅图片，最大 8MB
