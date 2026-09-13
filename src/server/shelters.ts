import { Prisma } from "@/generated/prisma/client";
import type { DisasterKey } from "@/lib/disasters";
import type { ShelterFilter } from "@/lib/filter";
import { type Bbox, cellSizeDeg } from "@/lib/geo";
import type { ShelterPoint, SheltersResult } from "@/lib/shelter";
import { prisma } from "@/server/db";
import { sqlWhereFor } from "@/server/shelter-query";

/**
 * 表示範囲の避難場所を引く。
 * MAX_POINTS 以下なら点そのまま、超えたらグリッド集約に切り替える。
 */

/**
 * 1回のレスポンスで個々の点を返す上限。
 *
 * 実測（2026-09-05・ローカル Postgres・全国 199,116 件）:
 *   z14 徒歩圏     29 件
 *   z12 東京都心   936 件
 *   z10 東京都全域 10,330 件
 *   z8  関東       32,571 件
 *   z5  全国       199,116 件
 *
 * z10 以下は点をそのまま返すと数 MB になり、描画以前に転送で破綻する。
 * ズームの閾値ではなく「実際に何件あるか」で切り替える。
 * 過疎な地域では z8 でも点のまま出せるし、都心では z12 でもクラスタになる。
 */
export const MAX_POINTS = 2000;

/** クラスタの安全弁。グリッドの解像度から見て通常ここには当たらない。 */
const MAX_CLUSTERS = 5000;

export async function fetchShelters(
  bbox: Bbox,
  cells: number,
  filter: ShelterFilter,
): Promise<SheltersResult> {
  // 件数を数えてから取り直すと往復が2回になる。1件多く取って超過を判定する。
  const rows = await prisma.shelter.findMany({
    where: whereFor(bbox, filter),
    // address は**まとめる鍵にだけ使い、点としては返さない**。
    // 2,000 点ぶんの住所を載せると転送量が数十 KB 増えるが、
    // 地図の点に住所は要らない（押したときに詳細を取りに行く）。
    select: {
      sourceId: true,
      kind: true,
      name: true,
      address: true,
      lat: true,
      lng: true,
    },
    take: MAX_POINTS + 1,
  });

  if (rows.length <= MAX_POINTS) {
    return {
      mode: "points",
      // **件数は指定の数のまま数える。** まとめるのは描き方の話で、
      // 「1行＝1つの指定」という持ち方は変えない。
      total: rows.length,
      points: collapsePoints(
        rows.map((r) => ({
          id: r.sourceId,
          kind: r.kind,
          name: r.name,
          address: r.address,
          lat: round5(r.lat),
          lng: round5(r.lng),
        })),
      ),
    };
  }

  return fetchClusters(bbox, cells, filter);
}

/**
 * 地図に出す点を、2つの見方でまとめる。
 *
 * **1. 同じ施設（名前＋住所が一致）は1つの点にする。** 元データは1行＝1つの指定で、
 * 同じ学校に緊急と避難所の2つの指定があると、座標が数十 m ずれた2点になる
 * （常盤小学校は住所が同じで 25m ずれる）。z13 では1px も離れず、
 * ただ重なって見えるだけになる。実データで 46,124 組。
 *
 * **2. 座標が完全に一致するものも1つにする。** 1で寄らなかった組
 * （「南町中学校（体育館等）」と「南町中学校」のように名前が違うもの）も、
 * 同じ座標ならピクセルまで重なる。しかもこのクエリには ORDER BY が無いので、
 * **どちらが上に来るかは不定**で、取り込み直すと入れ替わる。つまり
 * **指定緊急避難場所でもある建物が、青い点（指定避難所）だけに見えることがあった。**
 * このアプリが防ごうとしている誤解そのものなので、重なりのほうを無くす。
 *
 * **どちらも「同じ施設だ」と言い切るための統合ではない。** 残すのは常に
 * 指定緊急避難場所（災害種別を持ち、先に向かう場所）で、両方そろっていれば
 * `both` を立てて地図が二色で描く。件数（total）は指定の数のまま数える。
 */
function collapsePoints(
  points: (ShelterPoint & { address: string })[],
): ShelterPoint[] {
  const byFacility = collapseBy(points, (p) => `${p.name}|${p.address}`);
  const bySpot = collapseBy(byFacility, (p) => `${p.lat},${p.lng}`);

  // address はここで落とす（外に出すのは ShelterPoint の形だけ）。
  return bySpot.map(({ id, kind, name, lat, lng, both }) => ({
    id,
    kind,
    name,
    lat,
    lng,
    both,
  }));
}

/** 同じ鍵の点を1つに寄せる。両方の種別がそろっていれば both を立てる。 */
function collapseBy<T extends ShelterPoint>(
  points: T[],
  keyOf: (point: T) => string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const point of points) {
    const key = keyOf(point);
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }

  const collapsed: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]);
      continue;
    }

    const emergency = group.find((p) => p.kind === "EMERGENCY");
    const primary = emergency ?? group[0];
    const both =
      group.some((p) => p.both) ||
      (Boolean(emergency) && group.some((p) => p.kind === "SHELTER"));

    collapsed.push(both ? { ...primary, both: true } : primary);
  }

  return collapsed;
}

async function fetchClusters(
  bbox: Bbox,
  cells: number,
  filter: ShelterFilter,
): Promise<SheltersResult> {
  const cellDeg = cellSizeDeg(bbox, cells);

  const rows = await prisma.$queryRaw<
    { count: number; lat: number; lng: number }[]
  >(Prisma.sql`
    SELECT
      count(*)::int    AS count,
      avg(lat)::float8 AS lat,
      avg(lng)::float8 AS lng
    FROM "Shelter"
    WHERE ${sqlWhereFor(bbox, filter)}
    GROUP BY floor(lat / ${cellDeg}), floor(lng / ${cellDeg})
    ORDER BY count(*) DESC
    LIMIT ${MAX_CLUSTERS}
  `);

  return {
    mode: "clusters",
    total: rows.reduce((sum, r) => sum + r.count, 0),
    cellDeg,
    clusters: rows.map((r) => ({
      lat: round5(r.lat),
      lng: round5(r.lng),
      count: r.count,
    })),
  };
}

/**
 * 災害種別ごとの where 断片。
 *
 * 列名を文字列から組み立てれば1行で書けるが、それだと Prisma の型が効かず、
 * 列名を変えたときに実行時まで気づけない。8行の重複を引き受けて型で守る。
 */
const DISASTER_WHERE: Record<DisasterKey, Prisma.ShelterWhereInput> = {
  flood: { flood: true },
  landslide: { landslide: true },
  stormSurge: { stormSurge: true },
  earthquake: { earthquake: true },
  tsunami: { tsunami: true },
  fire: { fire: true },
  inlandFlood: { inlandFlood: true },
  volcano: { volcano: true },
};

function whereFor(bbox: Bbox, filter: ShelterFilter): Prisma.ShelterWhereInput {
  return {
    lat: { gte: bbox.south, lte: bbox.north },
    lng: { gte: bbox.west, lte: bbox.east },
    // 両方表示するときは kind の条件を付けない
    ...(filter.kinds.length === 1 ? { kind: filter.kinds[0] } : {}),
    /*
      災害種別を持つのは指定緊急避難場所だけ。指定避難所は絞らずに残す。
      複数選んだぶんは AND で重ねる（選んだ災害のすべてで使える場所）。
      索引は (lat, lng, kind, 災害種別8種) に8種すべてが載っているので、
      条件が増えても Index Only Scan のまま（判断3）。
      生 SQL 版（src/server/shelter-query.ts の sqlWhereFor）と同じ条件にすること。
    */
    ...(filter.disasters.length > 0
      ? {
          OR: [
            { kind: "SHELTER" as const },
            { AND: filter.disasters.map((key) => DISASTER_WHERE[key]) },
          ],
        }
      : {}),
    // 受入対象者は指定避難所にしかない列。立てると緊急避難場所は残らない。
    ...(filter.welfareOnly ? { targetPersons: { not: null } } : {}),
  };
}

/** 小数5桁 ≒ 1m。これ以上の桁は転送量になるだけで地図では見えない。 */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
