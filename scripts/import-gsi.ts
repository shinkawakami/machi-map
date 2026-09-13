/**
 * 国土地理院「指定緊急避難場所・指定避難所データ」を取り込む。
 *
 *   npm run import:gsi                キャッシュがあれば再利用
 *   npm run import:gsi -- --refresh   必ずダウンロードし直す
 *
 * 元データは公開されていていつでも取り込み直せるので、差分更新はせず毎回まるごと入れ替える。
 * そのため Shelter.id は取り込みのたびに変わる。外に出す識別子には sourceId を使うこと。
 *
 * 壊れたデータで既存を消してしまわないよう、3ファイルすべてを読んでパースし終えてから
 * 削除と投入に入る。
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, type OptionsWithColumns } from "csv-parse/sync";
import { prisma } from "../src/server/db";
import type { Prisma } from "../src/generated/prisma/client";
import type { ShelterKind } from "../src/generated/prisma/enums";

const BASE = "https://hinanmap.gsi.go.jp/hinanjocp/defaultFtpData";
const CACHE_DIR = path.join(process.cwd(), ".cache", "gsi");

/** _1 が指定避難所、_2 が指定緊急避難場所。名前と番号が逆なので注意。 */
const SOURCES = {
  municipality: `${BASE}/publicHistoryCSV/publicHistoryListData.csv`,
  SHELTER: `${BASE}/csv/mergeFromCity_1.csv`,
  EMERGENCY: `${BASE}/csv/mergeFromCity_2.csv`,
} as const;

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

/** 災害種別8種。CSV の列名 → スキーマのフィールド名 */
const HAZARDS = {
  洪水: "flood",
  "崖崩れ、土石流及び地滑り": "landslide",
  高潮: "stormSurge",
  地震: "earthquake",
  津波: "tsunami",
  大規模な火事: "fire",
  内水氾濫: "inlandFlood",
  火山現象: "volcano",
} as const;

const CHUNK = 5_000;

type Row = Record<string, string>;

// ---------- 取得とパース ----------

async function fetchCsv(url: string, refresh: boolean): Promise<string> {
  const file = path.join(CACHE_DIR, path.basename(url));
  if (!refresh && existsSync(file)) {
    console.log(`  キャッシュを使う: ${path.basename(file)}`);
    return readFile(file, "utf8");
  }
  console.log(`  ダウンロード: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const body = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, body, "utf8");
  return body;
}

/**
 * 引用符の中に改行が入っている行があるので、行分割ではなく CSV パーサを使う。
 * ファイルは UTF-8 BOM 付き。
 */
function parseCsv(body: string, columns: true | string[]): Row[] {
  const options: OptionsWithColumns<Row> = {
    columns,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  };
  return parse<Row>(body, options);
}

function toDate(s: string): Date | null {
  const v = s?.trim();
  return v ? new Date(`${v}T00:00:00Z`) : null;
}

/** '1' が該当、空文字が非該当。それ以外は出てこないが、出たら気づけるようにする。 */
function toFlag(s: string, context: string): boolean {
  const v = s?.trim() ?? "";
  if (v === "1") return true;
  if (v === "") return false;
  throw new Error(`想定外のフラグ値 "${v}" (${context})`);
}

async function loadMunicipalities(refresh: boolean): Promise<Prisma.MunicipalityCreateManyInput[]> {
  const body = await fetchCsv(SOURCES.municipality, refresh);
  // ヘッダ行が無いので列名を与える
  const rows = parseCsv(body, [
    "code", "fullName", "publishedAt", "lastUpdatedAt", "statusCode", "statusText",
  ]);

  return rows.map((r) => {
    const code = r.code.trim();
    const fullName = r.fullName.trim();
    const prefecture = PREFECTURES[Number(code.slice(0, 2)) - 1];
    if (!prefecture || !fullName.startsWith(prefecture)) {
      throw new Error(`市町村コードと名前が噛み合わない: ${code} ${fullName}`);
    }
    return {
      code,
      fullName,
      prefecture,
      name: fullName.slice(prefecture.length),
      publishedAt: toDate(r.publishedAt),
      lastUpdatedAt: toDate(r.lastUpdatedAt),
      statusCode: r.statusCode.trim() || null,
      statusText: r.statusText.trim() || null,
    };
  });
}

async function loadShelters(
  kind: ShelterKind,
  codeByName: Map<string, string>,
  refresh: boolean,
): Promise<Prisma.ShelterCreateManyInput[]> {
  const body = await fetchCsv(SOURCES[kind], refresh);
  const rows = parseCsv(body, true);
  const isEmergency = kind === "EMERGENCY";
  const sameAddressColumn = isEmergency ? "指定避難所との住所同一" : "指定緊急避難場所との住所同一";

  return rows.map((r) => {
    const fullName = r["都道府県名及び市町村名"].trim();
    const municipalityCode = codeByName.get(fullName);
    if (!municipalityCode) throw new Error(`市町村マスタに無い: ${fullName}`);

    const sourceId = r["共通ID"].trim();
    const lat = Number(r["緯度"]);
    const lng = Number(r["経度"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`緯度経度が数値でない: ${sourceId} ${r["施設・場所名"]}`);
    }

    const hazards = Object.fromEntries(
      Object.entries(HAZARDS).map(([column, field]) => [
        field,
        // 指定避難所には災害種別の概念が無いので null。
        // false（その災害では使えない）と取り違えないための区別。
        isEmergency ? toFlag(r[column], `${sourceId} ${column}`) : null,
      ]),
    );

    return {
      sourceId,
      kind,
      municipalityCode,
      name: r["施設・場所名"].trim(),
      address: r["住所"].trim(),
      lat,
      lng,
      sameAddressAsOther: toFlag(r[sameAddressColumn], `${sourceId} ${sameAddressColumn}`),
      ...hazards,
      otherMatters: r["その他市町村長が必要と認める事項"]?.trim() || null,
      targetPersons: r["受入対象者"]?.trim() || null,
      note: r["備考"]?.trim() || null,
    };
  });
}

// ---------- 記録 ----------

async function startRun(source: string, url: string) {
  const run = await prisma.importRun.create({
    data: { source, fileName: path.basename(url) },
  });
  return run.id;
}

async function finishRun(id: string, rowCount: number) {
  await prisma.importRun.update({
    where: { id },
    data: { rowCount, finishedAt: new Date(), status: "SUCCESS" },
  });
}

async function failRuns(ids: string[], error: unknown) {
  await prisma.importRun.updateMany({
    where: { id: { in: ids }, status: "RUNNING" },
    data: { finishedAt: new Date(), status: "FAILED", error: String(error) },
  });
}

// ---------- 投入 ----------

async function insertShelters(data: Prisma.ShelterCreateManyInput[]) {
  for (let i = 0; i < data.length; i += CHUNK) {
    await prisma.shelter.createMany({ data: data.slice(i, i + CHUNK) });
  }
}

/** 市町村ごとの件数を埋める（カバー率ページの元データ）。 */
async function countUpMunicipalities() {
  // 1,700 市町村を1件ずつ更新すると往復が効いてくるので1文で済ませる。
  // Municipality は毎回作り直していて既定値が 0 なので、0件の市町村は触らなくてよい。
  const updated = await prisma.$executeRaw`
    UPDATE "Municipality" m
    SET "emergencyCount" = c.emergency, "shelterCount" = c.shelter
    FROM (
      SELECT "municipalityCode",
             COUNT(*) FILTER (WHERE kind = 'EMERGENCY')::int AS emergency,
             COUNT(*) FILTER (WHERE kind = 'SHELTER')::int   AS shelter
      FROM "Shelter"
      GROUP BY "municipalityCode"
    ) c
    WHERE m.code = c."municipalityCode"
  `;
  console.log(`  ${updated.toLocaleString()} 市町村に件数を反映`);
}

/** 取り込んだ結果が壊れていないかを確認する。 */
async function verify() {
  const emergency = await prisma.shelter.count({ where: { kind: "EMERGENCY" } });
  const shelter = await prisma.shelter.count({ where: { kind: "SHELTER" } });

  // 指定緊急避難場所は必ず1つ以上の災害種別を持つ（元データで0件であることを確認済み）
  const noHazard = await prisma.shelter.count({
    where: {
      kind: "EMERGENCY",
      flood: false, landslide: false, stormSurge: false, earthquake: false,
      tsunami: false, fire: false, inlandFlood: false, volcano: false,
    },
  });
  // 指定避難所は災害種別を持たない
  const strayHazard = await prisma.shelter.count({
    where: { kind: "SHELTER", NOT: { flood: null } },
  });
  const outOfJapan = await prisma.shelter.count({
    where: {
      OR: [{ lat: { lt: 20 } }, { lat: { gt: 46 } }, { lng: { lt: 122 } }, { lng: { gt: 154 } }],
    },
  });

  console.log("\n検算");
  console.log(`  指定緊急避難場所                    ${emergency.toLocaleString()} 件`);
  console.log(`  指定避難所                          ${shelter.toLocaleString()} 件`);
  console.log(`  災害種別が全て false の緊急避難場所  ${noHazard} 件 (0 であること)`);
  console.log(`  災害種別を持つ指定避難所            ${strayHazard} 件 (0 であること)`);
  console.log(`  日本の範囲外の座標                  ${outOfJapan} 件 (0 であること)`);
  if (noHazard || strayHazard || outOfJapan) throw new Error("検算に失敗した");

  const LABELS: Record<string, string> = {
    "11": "指定緊急避難場所のみ",
    "12": "指定避難所のみ",
    "9": "データ未登録",
  };
  const status = await prisma.municipality.groupBy({
    by: ["statusCode"],
    _count: { _all: true },
    orderBy: { _count: { code: "desc" } },
  });
  console.log("\n市町村の整備状況");
  for (const s of status) {
    const label = s.statusCode ? LABELS[s.statusCode] : "両方公開";
    console.log(`  ${label.padEnd(12, "　")} ${s._count._all.toLocaleString()}`);
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const t = Date.now();

  const runs = [
    await startRun("municipality", SOURCES.municipality),
    await startRun("EMERGENCY", SOURCES.EMERGENCY),
    await startRun("SHELTER", SOURCES.SHELTER),
  ];

  try {
    // 1. 取得とパース。ここでは DB を触らない。
    console.log("取得とパース");
    const municipalities = await loadMunicipalities(refresh);
    const codeByName = new Map(municipalities.map((m) => [m.fullName, m.code]));
    const emergency = await loadShelters("EMERGENCY", codeByName, refresh);
    const shelters = await loadShelters("SHELTER", codeByName, refresh);
    console.log(
      `  市町村 ${municipalities.length.toLocaleString()} / ` +
        `指定緊急避難場所 ${emergency.length.toLocaleString()} / ` +
        `指定避難所 ${shelters.length.toLocaleString()}`,
    );

    // 2. まるごと入れ替え。
    console.log("入れ替え");
    /*
      **2つの表を1文の TRUNCATE でまとめて切る。** Shelter が Municipality を
      参照しているので、順番に切ると外部キーで弾かれる。参照している側を同じ文に
      並べれば通る（**CASCADE は使わない。** 消える表を SQL に書き出しておきたい。
      CASCADE だと、後から参照が増えたときに黙って巻き込む）。
      DELETE をやめた理由は import-isj.ts に書いたものと同じで、
      死んだ行が残って表が膨らみ、取り込むたびにストレージの下限が上がるため。
    */
    await prisma.$executeRaw`TRUNCATE TABLE "Shelter", "Municipality"`;
    await prisma.municipality.createMany({ data: municipalities });
    await insertShelters(emergency);
    await insertShelters(shelters);

    /*
      **検算を通してから SUCCESS にする。** ここを逆にすると、記録が嘘をつく。
      failRuns は `status: "RUNNING"` の行だけを FAILED に倒すので、先に
      finishRun を呼んでしまうと、検算が落ちても**どの行にも当たらず**、
      3件とも SUCCESS のまま例外だけが飛ぶ。
      countUpMunicipalities も同じ理由でこちら側に置く（ここで落ちても同じことが起きる）。
    */
    await countUpMunicipalities();
    await verify();

    await finishRun(runs[0], municipalities.length);
    await finishRun(runs[1], emergency.length);
    await finishRun(runs[2], shelters.length);
  } catch (e) {
    await failRuns(runs, e);
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
