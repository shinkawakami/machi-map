import { Prisma } from "@/generated/prisma/client";
import type { ShelterKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

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

export type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ShelterPoint = {
  /** 共通ID。Shelter.id は取り込みのたびに変わるので外には出さない */
  id: string;
  kind: ShelterKind;
  name: string;
  lat: number;
  lng: number;
};

export type ShelterCluster = {
  lat: number;
  lng: number;
  count: number;
};

export type SheltersResult =
  | { mode: "points"; total: number; points: ShelterPoint[] }
  | {
      mode: "clusters";
      total: number;
      cellDeg: number;
      clusters: ShelterCluster[];
    };

/** `west,south,east,north`。範囲外・逆転・NaN は null を返して 400 にする。 */
export function parseBbox(raw: string | null): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;

  const [w, s, e, n] = parts;
  const west = clamp(w, -180, 180);
  const east = clamp(e, -180, 180);
  const south = clamp(s, -90, 90);
  const north = clamp(n, -90, 90);
  if (west >= east || south >= north) return null;

  return { west, south, east, north };
}

/** 横方向をいくつのセルに割るか。クライアントの画面幅から決まるので受け取る。 */
export function parseCells(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 16;
  return Math.round(clamp(n, 4, 32));
}

/**
 * グリッドのセルの大きさ。`360 / 2^k` のはしごに丸める。
 *
 * bbox の幅からそのまま割ると、パンのたびに幅の丸め誤差でセル境界が動き、
 * クラスタの点が小刻みに飛ぶ。2の冪に丸めておけば境界が地球に固定され、
 * 同じズームである限りパンしても位置が変わらない。
 *
 * 緯度側も同じ度数を使う。メルカトルなので画面上は縦長のセルになるが
 * （日本の緯度で約1.24倍）、クラスタの点は構成要素の平均位置に置くので実害がない。
 */
export function cellSizeDeg(bbox: Bbox, cells: number): number {
  const target = (bbox.east - bbox.west) / cells;
  const k = Math.round(Math.log2(360 / target));
  return 360 / 2 ** clamp(k, 0, 20);
}

/**
 * 表示範囲の避難場所を返す。
 * MAX_POINTS 以下なら点そのまま、超えたらグリッド集約に切り替える。
 */
export async function fetchShelters(
  bbox: Bbox,
  cells: number,
): Promise<SheltersResult> {
  // 件数を数えてから取り直すと往復が2回になる。1件多く取って超過を判定する。
  const rows = await prisma.shelter.findMany({
    where: {
      lat: { gte: bbox.south, lte: bbox.north },
      lng: { gte: bbox.west, lte: bbox.east },
    },
    select: { sourceId: true, kind: true, name: true, lat: true, lng: true },
    take: MAX_POINTS + 1,
  });

  if (rows.length <= MAX_POINTS) {
    return {
      mode: "points",
      total: rows.length,
      points: rows.map((r) => ({
        id: r.sourceId,
        kind: r.kind,
        name: r.name,
        lat: round5(r.lat),
        lng: round5(r.lng),
      })),
    };
  }

  return fetchClusters(bbox, cells);
}

async function fetchClusters(
  bbox: Bbox,
  cells: number,
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
    WHERE lat BETWEEN ${bbox.south} AND ${bbox.north}
      AND lng BETWEEN ${bbox.west} AND ${bbox.east}
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** 小数5桁 ≒ 1m。これ以上の桁は転送量になるだけで地図では見えない。 */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
