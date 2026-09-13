import { Prisma } from "@/generated/prisma/client";
import { DISASTER_TYPES } from "@/lib/disasters";
import { bboxAround, type LatLng } from "@/lib/geo";
import type { NearbyItem, PlaceSummary } from "@/lib/shelter";
import { prisma } from "@/server/db";
import { type DetailRow, toDetail } from "@/server/shelter-detail";
import {
  DETAIL_COLUMNS,
  RADII_M,
  sqlDistanceM,
  sqlWithinBbox,
} from "@/server/shelter-query";

/**
 * 拠点ごとの「8種の災害 × それぞれの最寄り」を引く。
 * 返す形（PlaceSummary）は src/lib/shelter.ts。
 *
 * 災害種別を持つのは指定緊急避難場所だけなので、表の本体はそちら。
 * 指定避難所（生活する場所）は別枠で最寄りを1件だけ添える。
 */

type Row = DetailRow & { slot: string; distanceM: number };

export async function fetchPlaceSummary(center: LatLng): Promise<PlaceSummary> {
  const nearest = new Map<string, NearbyItem>();
  let radiusM = RADII_M[0];

  for (const step of RADII_M) {
    const missing = slots().filter((slot) => !nearest.has(slot));
    if (missing.length === 0) break;

    radiusM = step;
    for (const row of await queryNearestEach(center, step, missing)) {
      // 矩形の中で最も近いものが円の外なら、円の中には何も無い。
      // 半径を広げて引き直す。
      if (row.distanceM > step) continue;
      nearest.set(row.slot, {
        ...toDetail(row),
        distanceM: Math.round(row.distanceM),
      });
    }
  }

  const rows = DISASTER_TYPES.map((disaster) => ({
    disaster: disaster.key,
    nearest: nearest.get(disaster.key) ?? null,
  }));

  return {
    radiusM,
    incomplete: rows.some((row) => row.nearest === null),
    rows,
    shelter: nearest.get(SHELTER_SLOT) ?? null,
  };
}

/** 指定避難所ぶんの枠。災害種別の8種と同じ仕組みで1回に混ぜて引く。 */
const SHELTER_SLOT = "shelter";

function slots(): string[] {
  return [...DISASTER_TYPES.map((d) => d.key), SHELTER_SLOT];
}

/**
 * 欲しい枠ぶんの「最寄り1件」を、1回の往復でまとめて引く。
 *
 * 枠ごとに UNION ALL で分けているのは、1行が複数の災害に対応するため。
 * `DISTINCT ON` では「洪水にも地震にも使える1件」を両方の枠に出せない。
 * 枠ごとに索引を引かせて LIMIT 1 で止めるほうが、結果も速さも素直になる。
 */
function queryNearestEach(
  center: LatLng,
  radiusM: number,
  wanted: string[],
): Promise<Row[]> {
  const bbox = bboxAround(center, radiusM);
  const distance = sqlDistanceM(center);

  const branches = wanted.map((slot) => {
    const kindAndFlag =
      slot === SHELTER_SLOT
        ? Prisma.sql`kind = 'SHELTER'::"ShelterKind"`
        : Prisma.sql`kind = 'EMERGENCY'::"ShelterKind" AND ${Prisma.raw(`"${slot}"`)} = true`;

    return Prisma.sql`(
      SELECT
        ${slot} AS "slot",
        ${DETAIL_COLUMNS},
        ${distance} AS "distanceM"
      FROM "Shelter"
      WHERE ${sqlWithinBbox(bbox)}
        AND ${kindAndFlag}
      ORDER BY "distanceM"
      LIMIT 1
    )`;
  });

  return prisma.$queryRaw<Row[]>(
    Prisma.join(branches, "\nUNION ALL\n"),
  );
}
