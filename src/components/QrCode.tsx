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

/**
 * 紙の上での1モジュールの最小サイズ（mm）。**固定するのは表示サイズではなくこちら。**
 *
 * QR が読めるかを決めるのはモジュールの実寸で、モジュール数のほうは URL の長さで変わる。
 * 拠点6件だと URL は percent-encode 後 289文字になり、型番13（69×69）まで太る。
 * 表示サイズを 104px（紙の上で 27.5mm）に固定していたので、1モジュールは
 * 拠点1件の 0.611mm に対し、**6件では 0.357mm** まで細っていた。
 * スマホでの読み取りは 0.4mm あたりが下限の目安なので、
 * **拠点を増やした人だけが読めない紙を受け取る**ことになる。
 * 紙は刷り直しがきかないので、ここは読み取れるほうに倒す。
 *
 * 0.55mm は、目安の 0.4mm に家庭用プリンタのにじみぶんの余裕を見た値。
 * 縮めることはしない（`size` は下限として扱う）。画面ならピンチで拡大できるので、
 * 細くて困るのは紙のほうだけ。
 */
const MIN_MODULE_MM = 0.55;

/** CSS の 1px は 1/96 インチ。印刷時もこの換算で紙に出る。 */
const PX_PER_MM = 96 / 25.4;

export default function QrCode({
  value,
  size = 160,
  className,
}: {
  value: string;
  /**
   * 表示サイズ（px）の**下限**。SVG なので印刷時は解像度に依らない。
   * モジュールが細くなりすぎるときは、ここより大きく描く（MIN_MODULE_MM）。
   */
  size?: number;
  className?: string;
}) {
  const { path, count } = useMemo(() => build(value), [value]);

  // 余白（クワイエットゾーン）は規格上4モジュール必要。読み取り率に直結する。
  const quiet = 4;
  const box = count + quiet * 2;

  /*
    余白も含めた box で見る。読み取りに要るのは符号部分の実寸だが、
    余白を別枠で足すと viewBox と実寸の対応がずれるので、同じ物差しで数える。
  */
  const px = Math.max(size, Math.ceil(box * MIN_MODULE_MM * PX_PER_MM));

  return (
    <svg
      width={px}
      height={px}
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
