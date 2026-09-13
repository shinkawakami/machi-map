/**
 * 国土交通省「位置参照情報（大字・町丁目レベル）」を取り込む。
 *
 *   npm run import:isj                キャッシュがあれば再利用
 *   npm run import:isj -- --refresh   必ずダウンロードし直す
 *
 * 住所から拠点を置くために使う町字の代表点。実行時に外部のジオコーディング API を
 * 叩かないための自前の索引で、根拠は .local/PLAN.md「住所検索のジオコーディング」。
 *
 * 作りは import-gsi.ts と同じ。47都道府県ぶんをすべて読んでパースし終えてから
 * 削除と投入に入る（壊れたデータで既存を消さないため）。
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { unzipSync } from "fflate";
import { normalizeAddress } from "../src/lib/address";
import { prisma } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";

/**
 * 大字・町丁目レベルの最新版は 19.0b（2025年データ）。
 * ファイル名は `<都道府県コード2桁>000-<版>.zip` で、版を上げるときはここだけ直す。
 * デジタル庁 ABR のカタログは作業環境から DNS が引けず、国交省側だけが到達できた。
 */
const VERSION = "19.0b";
const BASE = `https://nlftp.mlit.go.jp/isj/dls/data/${VERSION}`;
const CACHE_DIR = path.join(process.cwd(), ".cache", "isj");

const SOURCE = `国土交通省 位置参照情報（大字・町丁目レベル）${VERSION}`;

/** 日本の範囲。検算に使う（南鳥島・沖ノ鳥島まで含める）。 */
const JAPAN = { south: 20, north: 46, west: 122, east: 154 };

const CHUNK = 5_000;

type Row = {
  都道府県名: string;
  市区町村コード: string;
  市区町村名: string;
  大字町丁目コード: string;
  大字町丁目名: string;
  緯度: string;
  経度: string;
};

async function fetchZip(code: string, refresh: boolean): Promise<Uint8Array> {
  const file = path.join(CACHE_DIR, `${code}000-${VERSION}.zip`);
  if (!refresh && existsSync(file)) return new Uint8Array(await readFile(file));

  const url = `${BASE}/${code}000-${VERSION}.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const body = new Uint8Array(await res.arrayBuffer());
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, body);
  return body;
}

/** zip の中に CSV が1つ入っている。文字コードは CP932（UTF-8 ではない）。 */
function readCsv(zip: Uint8Array): Row[] {
  const files = unzipSync(zip);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".csv"));
  if (!name) throw new Error("zip に CSV が入っていません");

  const text = new TextDecoder("shift_jis").decode(files[name]);
  return parse(text, { columns: true, skip_empty_lines: true, bom: true });
}

function toRecord(row: Row): Prisma.MachiazaCreateManyInput {
  const name = row.大字町丁目名;
  return {
    sourceCode: row.大字町丁目コード,
    prefecture: row.都道府県名,
    municipality: row.市区町村名,
    municipalityCode: row.市区町村コード,
    name,
    // 取り込み側と検索側で同じ関数を通す。片側だけ寄せるとズレた瞬間に引けなくなる。
    searchKey: normalizeAddress(`${row.都道府県名}${row.市区町村名}${name}`),
    cityKey: normalizeAddress(`${row.市区町村名}${name}`),
    nameKey: normalizeAddress(name),
    lat: Number(row.緯度),
    lng: Number(row.経度),
  };
}

async function verify(records: Prisma.MachiazaCreateManyInput[]) {
  const outside = records.filter(
    (r) =>
      !(r.lat >= JAPAN.south && r.lat <= JAPAN.north) ||
      !(r.lng >= JAPAN.west && r.lng <= JAPAN.east),
  );
  const empty = records.filter((r) => !r.name || !r.searchKey);
  const prefectures = new Set(records.map((r) => r.prefecture));

  console.log("検算");
  console.log(`  町字                ${records.length.toLocaleString()} 件`);
  console.log(`  都道府県            ${prefectures.size} (47 であること)`);
  console.log(`  日本の範囲外の座標  ${outside.length} 件 (0 であること)`);
  console.log(`  名前が空            ${empty.length} 件 (0 であること)`);

  if (prefectures.size !== 47 || outside.length > 0 || empty.length > 0) {
    throw new Error("検算に失敗しました。入れ替えは済んでいます（要調査）");
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const t = Date.now();

  const run = await prisma.importRun.create({
    data: { source: SOURCE, fileName: `${BASE}/*.zip` },
  });

  try {
    console.log("取得とパース");
    const records: Prisma.MachiazaCreateManyInput[] = [];
    for (let i = 1; i <= 47; i += 1) {
      const code = String(i).padStart(2, "0");
      const rows = readCsv(await fetchZip(code, refresh));
      for (const row of rows) records.push(toRecord(row));
      process.stdout.write(`\r  ${code}/47  ${records.length.toLocaleString()} 件`);
    }
    console.log("");

    console.log("入れ替え");
    await prisma.machiaza.deleteMany({});
    for (let i = 0; i < records.length; i += CHUNK) {
      await prisma.machiaza.createMany({ data: records.slice(i, i + CHUNK) });
    }

    /*
      **検算を通してから SUCCESS にする。** 記録が「成功」と言えるのは、
      成功の条件（検算）を満たしたあとだけ。逆にすると、SUCCESS を書いた直後に
      落ちた取り込みが、成功として残る。
    */
    await verify(records);

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        rowCount: records.length,
      },
    });
  } catch (e) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: e instanceof Error ? e.message : String(e),
      },
    });
    throw e;
  }

  console.log(`\n完了 (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
