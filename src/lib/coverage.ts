import { prisma } from "@/lib/db";

/**
 * カバー率ページのためのデータ。
 *
 * このデータは「市町村が登録し、かつ公開に同意したもの」に限られる。
 * 見せ方の狙いは「全国が埋まっていない」ではない（市町村単位のカバー率は96.8%と高い）。
 * 見せるべきは **片方しか公開されていない市町村**で、
 * そこはこのアプリの主張2（緊急避難場所と避難所は別物）がそのまま効いてくる。
 */

/** 国土地理院の整備状況コード。null は両方公開。 */
const STATUS = {
  EMERGENCY_ONLY: "11",
  SHELTER_ONLY: "12",
  NONE: "9",
} as const;

/**
 * 北方領土の6村（色丹村・国後郡泊村・留夜別村・留別村・紗那村・蘂取村）。
 * データ未登録だが、他の未登録市町村と事情がまったく違うので並べるときに断る。
 * 件数の話に混ぜると実態を読み違える。
 *
 * **名前ではなくコードで持つ。** 北海道には積丹郡の泊村（01403）が別にあり、
 * マスタ上の表記も『国後郡泊村』と郡が付く。名前で判定すると、
 * 取りこぼすか、無関係の村に印を付けるかのどちらかになる。
 */
const DISPUTED_CODES = new Set([
  "01695",
  "01696",
  "01697",
  "01698",
  "01699",
  "01700",
]);

export type CoverageRow = {
  code: string;
  prefecture: string;
  name: string;
  emergencyCount: number;
  shelterCount: number;
  /** 北方領土の村。未登録の理由が他と違う */
  disputed: boolean;
};

export type Coverage = {
  total: number;
  both: number;
  emergencyOnly: CoverageRow[];
  shelterOnly: CoverageRow[];
  none: CoverageRow[];
  shelterTotals: { emergency: number; shelter: number };
  /** 市町村マスタが持つ最終更新日のうち最も新しいもの */
  sourceUpdatedAt: Date | null;
  /** このアプリが最後に取り込みを終えた時刻 */
  importedAt: Date | null;
};

const SELECT = {
  code: true,
  prefecture: true,
  name: true,
  emergencyCount: true,
  shelterCount: true,
} as const;

export async function fetchCoverage(): Promise<Coverage> {
  const [total, both, partial, none, byKind, source, lastImport] =
    await Promise.all([
      prisma.municipality.count(),
      prisma.municipality.count({ where: { statusCode: null } }),
      prisma.municipality.findMany({
        where: { statusCode: { in: [STATUS.EMERGENCY_ONLY, STATUS.SHELTER_ONLY] } },
        select: { ...SELECT, statusCode: true },
        orderBy: { code: "asc" },
      }),
      prisma.municipality.findMany({
        where: { statusCode: STATUS.NONE },
        select: SELECT,
        orderBy: { code: "asc" },
      }),
      prisma.shelter.groupBy({ by: ["kind"], _count: true }),
      prisma.municipality.aggregate({ _max: { lastUpdatedAt: true } }),
      prisma.importRun.findFirst({
        where: { status: "SUCCESS" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
    ]);

  const countOf = (kind: "EMERGENCY" | "SHELTER") =>
    byKind.find((row) => row.kind === kind)?._count ?? 0;

  return {
    total,
    both,
    emergencyOnly: partial
      .filter((row) => row.statusCode === STATUS.EMERGENCY_ONLY)
      .map(toRow),
    shelterOnly: partial
      .filter((row) => row.statusCode === STATUS.SHELTER_ONLY)
      .map(toRow),
    none: none.map(toRow),
    shelterTotals: {
      emergency: countOf("EMERGENCY"),
      shelter: countOf("SHELTER"),
    },
    sourceUpdatedAt: source._max.lastUpdatedAt,
    importedAt: lastImport?.finishedAt ?? null,
  };
}

function toRow(row: {
  code: string;
  prefecture: string;
  name: string;
  emergencyCount: number;
  shelterCount: number;
}): CoverageRow {
  return { ...row, disputed: DISPUTED_CODES.has(row.code) };
}

/** 母数に対する割合。小数1桁まで出す（0.5%未満を 0% と書かないため） */
export function percent(part: number, whole: number): string {
  if (whole === 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}
