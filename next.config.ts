import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const isCloudflarePages = process.env.CLOUDFLARE_PAGES === "true";

const nextConfig: NextConfig = {
  output: isGithubPages || isCloudflarePages ? "export" : undefined,
  basePath: isGithubPages ? "/ghibli-style-converter" : undefined,
  assetPrefix: isGithubPages ? "/ghibli-style-converter/" : undefined,
  images: {
    unoptimized: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  }
};

export default nextConfig;
