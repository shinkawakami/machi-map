import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "わが家の逃げ先 | 拠点ごとに、災害の種類で変わる避難場所";
const DESCRIPTION =
  "自宅・職場・実家などの拠点ごとに、8種類の災害それぞれで使える最寄りの避難場所を出します。避難場所は災害の種類ごとに使える・使えないが分かれています。ログイン不要。国土地理院の公開データをもとに作成。";

export const metadata: Metadata = {
  // opengraph-image を絶対 URL に組み立てるために要る。無いと og:image が
  // ビルド環境（localhost や VERCEL_URL）に引きずられる。
  metadataBase: new URL("https://wagaya-nigesaki.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "わが家の逃げ先",
    locale: "ja_JP",
    type: "website",
  },
  // 画像は app/opengraph-image.tsx が生成したものを X 側にも使わせる。
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  // 地図をピンチで拡大する場面があるので、拡大自体は禁止しない。
  width: "device-width",
  initialScale: 1,
  /*
    **この画面は明色しか持たない、と名乗る。** 配色は白地の一本で、
    dark: の指定はどこにも無い。名乗らないと、OS が暗色のときにブラウザが
    入力欄・スクロールバー・既定の文字色だけを暗くしにかかり、
    地図と白いパネルの上にそこだけ暗い部品が乗る。
    暗色に対応するならこの行を消して、globals.css から作り直すこと。
  */
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      {/* 地図が画面いっぱいに広がるので、ページ自体はスクロールさせない。 */}
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
