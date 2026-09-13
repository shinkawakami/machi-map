import { Prisma } from "@/generated/prisma/client";
import type { ShelterFilter } from "@/lib/filter";
import { bboxAround, type LatLng } from "@/lib/geo";
import type { NearbyItem, NearbyResult } from "@/lib/shelter";
import { prisma } from "@/server/db";
import { type DetailRow, toDetail } from "@/server/shelter-detail";
import {
  DETAIL_COLUMNS,
  RADII_M,
  sqlDistanceM,
  sqlWhereFor,
} from "@/server/shelter-query";

/**
 * 起点から近い順に避難場所を返す。
 *
 * 「矩形内が0件だったらどう広げるか」への答えが RADII_M のはしご
 * （src/server/shelter-query.ts）。都市部では1回、疎な地域では最大8回の往復になる。
 */

/** 中心から近い順に返す。件数が揃うまで半径を倍々に広げる。 */
export async function fetchNearby(
  center: LatLng,
  limit: number,
  filter: ShelterFilter,
): Promise<NearbyResult> {
  let result: NearbyResult = {
    radiusM: RADII_M[0],
    exhausted: true,
    items: [],
  };

  for (const radiusM of RADII_M) {
    const rows = await queryWithin(center, radiusM, limit, filter);

    /*
      半径を広げるかどうかは、**まとめる前の指定の数**で決める。
      まとめた後の行数で判定すると、同じ場所の2件が1行になったぶんだけ
      「まだ足りない」と読み違えて、要らない往復（最大 256km まで）が増える。
      exhausted の意味も「指定がこれしか無い」のままにそろえる。
    */
    result = {
      radiusM,
      exhausted: rows.length < limit,
      items: mergeSameFacility(rows),
    };
    if (rows.length >= limit) break;
  }

  return result;
}

/**
 * 同じ施設に緊急と避難所の両方の指定があるときは、1行にまとめる。
 *
 * **鍵は元データの「名前＋住所」。座標では寄せない。** 同じ施設でも2つの指定で
 * 座標が数十 m ずれていることが普通にある（常盤小学校は住所が同じで 25m ずれる）。
 * 実データで、名前と住所が完全一致する組は 46,124 組（緊急の 39.1% が関与）。
 * 座標の完全一致だけだと 27,875 組で、**多数派を取りこぼす**。
 *
 * **名前も条件にする**（住所だけでは寄せない）。同じ住所でも
 * 「南町中学校（体育館等）」と「南町中学校」のように、
 * **建物のどこが指定されているかが違う**ことがある。逃げるときに効く差なので、
 * 名前が違えば2行のまま出す。
 *
 * 残す1件は指定緊急避難場所。災害種別を持つのはこちらで、先に向かう場所でもある。
 * 避難所の指定があることは `alsoKind` で渡し、UI 側で出す
 * （種別の区別はこのアプリの主張2なので、まとめても消さない）。
 */
function mergeSameFacility(items: NearbyItem[]): NearbyItem[] {
  const groups = new Map<string, NearbyItem[]>();
  for (const item of items) {
    const key = `${item.name}|${item.address}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const merged: NearbyItem[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // 残すのは指定緊急避難場所。災害種別を持つのはこちらで、先に向かう場所でもある。
    const primary = group.find((i) => i.kind === "EMERGENCY") ?? group[0];
    const other = group.find((i) => i.kind !== primary.kind);
    merged.push({
      ...primary,
      alsoKind: other?.kind,
      // 同じ施設でも指定ごとに座標がずれるので、近いほうの距離で出す。
      distanceM: Math.min(...group.map((i) => i.distanceM)),
    });
  }

  // まとめた行は近いほうの距離を採るので、並びを取り直す。
  return merged.sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * 半径 radiusM の**円**の中を近い順に返す。
 *
 * 矩形で絞ってから円で切り直しているのが要点。矩形のまま距離順に並べると、
 * 角にある遠いものが入る一方で、辺の外にあるより近いものが落ちる。
 * 円で切れば「半径内の最も近い limit 件」になり、それが limit 件揃った時点で
 * 全体の最近傍だと言い切れる（それより近いものは必ず円の中にある）。
 */
async function queryWithin(
  center: LatLng,
  radiusM: number,
  limit: number,
  filter: ShelterFilter,
): Promise<NearbyItem[]> {
  const rows = await prisma.$queryRaw<(DetailRow & { distanceM: number })[]>(
    Prisma.sql`
      SELECT * FROM (
        SELECT
          ${DETAIL_COLUMNS},
          ${sqlDistanceM(center)} AS "distanceM"
        FROM "Shelter"
        WHERE ${sqlWhereFor(bboxAround(center, radiusM), filter)}
      ) t
      WHERE "distanceM" <= ${radiusM}
      ORDER BY "distanceM"
      LIMIT ${limit}
    `,
  );

  return rows.map((row) => ({
    ...toDetail(row),
    // m 単位より細かい精度は元データの座標に無い（小数2桁の行もある）
    distanceM: Math.round(row.distanceM),
  }));
}
