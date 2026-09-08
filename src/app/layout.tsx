import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "にげどこ | 災害の種類で選ぶ避難場所の地図",
  description:
    "全国の指定緊急避難場所・指定避難所を地図で見られます。避難場所は災害の種類ごとに使える・使えないが分かれています。国土地理院の公開データをもとに作成。",
};

export const viewport: Viewport = {
  // 地図をピンチで拡大する場面があるので、拡大自体は禁止しない。
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${geistSans.variable} h-full antialiased`}>
      {/* 地図が画面いっぱいに広がるので、ページ自体はスクロールさせない。 */}
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
