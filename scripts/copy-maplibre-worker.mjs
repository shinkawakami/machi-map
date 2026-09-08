/**
 * maplibre-gl のワーカーを public/ に置く。
 *
 * v6 のワーカー URL は実行時に組み立てられる:
 *   new URL(`./maplibre-gl-worker.mjs`, import.meta.url)
 * テンプレート文字列なのでバンドラから見えず、Turbopack はこのファイルを
 * 出力しない。実行時には /_next/static/chunks/maplibre-gl-worker.mjs を
 * 取りに行って 404（＝Next の HTML）を掴み、
 * 「Failed to load module script: non-JavaScript MIME type "text/html"」で死ぬ。
 *
 * ワーカーが死ぬと GeoJSON のパースだけが黙って止まる。ラスタタイルは
 * メインスレッドで読むので地図は出るし、DOM のマーカーも出る。
 * 症状が「点だけ出ない」に化けるので、原因にたどり着きにくい。
 *
 * 自前で配って setWorkerUrl() で教える。postinstall で毎回コピーするので、
 * インストールされている maplibre-gl のバージョンと必ず一致する。
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const dest = path.join(process.cwd(), "public", "maplibre");

// ワーカーは shared を相対 import するので、同じディレクトリに並べる。
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(dest, { recursive: true });
for (const file of files) {
  await copyFile(path.join(dist, file), path.join(dest, file));
}
console.log(`maplibre worker -> public/maplibre/ (${files.join(", ")})`);
