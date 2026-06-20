import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghibli Style Converter",
  description: "Upload a photo and convert it into a warm hand-painted animation look."
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
