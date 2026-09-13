import { ImageResponse } from "next/og";

import { KINDS } from "@/lib/kinds";

/**
 * SNS に貼られたときのカード画像。リンクだけが先に回ることを前提に、
 * 主張1（災害の種類で使える場所が変わる）を画像そのものに書く。
 *
 * 件数は「約20万件」と丸めてある。月次の取り込みで実数は動くが、この画像は
 * ビルド時に固定されるので、更新のたびに嘘になる数字を焼き込まない。
 */
export const alt = "わが家の逃げ先｜災害の種類で、逃げこめる場所は変わります";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "わが家の逃げ先";
const LINE1 = "災害の種類で、";
const LINE2 = "逃げこめる場所は変わります";
const SUB =
  "洪水では使えない避難場所があります。自宅や職場から、8種類の災害それぞれの最寄りを1枚に。";
const FOOT = "wagaya-nigesaki.vercel.app ／ 出典：国土地理院";

/**
 * Noto Sans JP を Google Fonts から取る。`text=` を付けると、使う文字だけの
 * サブセットが返るので数 KB で済む（ImageResponse には 500KB の上限がある）。
 *
 * **User-Agent に注意。** 今どきのブラウザを名乗ると woff2 が返ってくるが、
 * ImageResponse（satori）が読めるのは ttf / otf / woff だけ。
 * 素の `Mozilla/5.0` を送ると truetype が返る。
 *
 * 取得はビルド時に1回だけ走る（このページは静的に生成される）。
 * next/font/google で Geist を落としているのと同じく、ビルドに外部取得が入る形。
 */
async function notoSansJp(weight: 400 | 700, text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((res) => res.text());

  const url = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1];
  if (!url) {
    throw new Error(`Noto Sans JP (${weight}) の truetype が取れませんでした`);
  }

  return fetch(url).then((res) => res.arrayBuffer());
}

export default async function Image() {
  const kindLabels = KINDS.map((kind) => kind.label).join("");
  const text = BRAND + LINE1 + LINE2 + SUB + FOOT + kindLabels;

  const [regular, bold] = await Promise.all([
    notoSansJp(400, text),
    notoSansJp(700, text),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#ffffff",
          padding: "64px 72px",
          fontFamily: "Noto Sans JP",
          color: "#18181b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 9999,
              backgroundColor: KINDS[0].color,
            }}
          />
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
            {BRAND}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 700 }}>
            {LINE1}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 700,
              marginTop: 8,
            }}
          >
            {LINE2}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              lineHeight: 1.6,
              color: "#52525b",
              marginTop: 28,
              maxWidth: 900,
            }}
          >
            {SUB}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* 主張2。色はアプリの地図・凡例と同じ lib/kinds.ts のもの。 */}
          <div style={{ display: "flex", gap: 16 }}>
            {KINDS.map((kind) => (
              <div
                key={kind.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #e4e4e7",
                  borderRadius: 9999,
                  padding: "10px 20px",
                  fontSize: 24,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 9999,
                    backgroundColor: kind.color,
                  }}
                />
                {kind.label}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", fontSize: 20, color: "#a1a1aa" }}>
            {FOOT}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Noto Sans JP", data: regular, weight: 400, style: "normal" },
        { name: "Noto Sans JP", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
