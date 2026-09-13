"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/**
 * QR コード。**生成はクライアント側で完結させる。**
 *
 * サーバーに作らせると、そのリクエストに自宅の座標が載る。
 * URL を正本にして「サーバーに持たない」と決めた以上、
 * 画像を作るためだけにサーバーへ渡すのは筋が通らない（URL 短縮を自前でやらないのと同じ理由）。
 *
 * ライブラリは qrcode-generator（MIT・依存なし）。描画は自前の SVG にしている。
 * 紙に出すのが目的なので、拡大しても潰れない形で出したい。
 */
export default function QrCode({
  value,
  size = 160,
  className,
}: {
  value: string;
  /** 表示サイズ（px）。SVG なので印刷時は解像度に依らない */
  size?: number;
  className?: string;
}) {
  const { path, count } = useMemo(() => build(value), [value]);

  // 余白（クワイエットゾーン）は規格上4モジュール必要。読み取り率に直結する。
  const quiet = 4;
  const box = count + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label="この URL の QR コード"
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={box} height={box} fill="#ffffff" />
      <path d={path} fill="#000000" transform={`translate(${quiet} ${quiet})`} />
    </svg>
  );
}

function build(value: string): { path: string; count: number } {
  // 既定の byte モードは ASCII しか通さない。URL は percent-encode 済みの
  // 形で渡ってくるはずだが、生の日本語が来たときのために変換しておく。
  const data = /^[\x20-\x7e]*$/.test(value) ? value : encodeURI(value);

  // 型番 0 は「入る中で最小」を自動で選ぶ。誤り訂正 M は印刷して貼る用途の標準。
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();

  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }

  return { path: parts.join(""), count };
}
