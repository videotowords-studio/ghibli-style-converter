import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小学生之友",
  description: "作文宝、吉卜力转绘、周工解梦、心愿墙和积分抽奖。"
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
