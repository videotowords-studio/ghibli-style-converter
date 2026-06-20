import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能创作工坊",
  description: "图片转绘、文章撰写和生成记录管理。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
