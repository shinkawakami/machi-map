import { Prisma } from "@/generated/prisma/client";
import type { ShelterKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  type DetailRow,
  type ShelterDetail,
  toDetail,
} from "@/lib/shelter-detail";
import { type Bbox, type ShelterFilter, sqlWhereFor } from "@/lib/shelters";

export type LatLng = { lat: number; lng: number };

export type NearbyItem = ShelterDetail & {
  distanceM: number;
  /**
   * 同じ場所・同じ名前で、もう一方の種別の指定もある（1行にまとめてある）。
   * まとめる条件は mergeSameFacility を参照。
   */
  alsoKind?: ShelterKind;
};

export type NearbyResult = {
  /** 実際に使った半径（m）。どこまで広げて見つけたのかは UI で見せる */
  radiusM: number;
  /** 上限まで広げても件数に届かなかった＝この付近にはこれしか無い */
  exhausted: boolean;
  items: NearbyItem[];
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * 半径を広げていくはしご（m）。
 *
 * 「矩形内が0件だったらどう広げるか」への答え。避難場所が疎な地域では
 * 徒歩圏に1件も無いことが普通に起きる（実データで確認できる）ので、
 * 見つかるまで倍々に広げる。
 *
 * 2km から始めるのは、都市部ならここで足りて往復が1回で終わるから。
 * 256km で打ち切るのは、そこまで遠い避難場所を案内しても意味がないのと、
 * 打ち切りを「この付近にはこれしか無い」として UI で言えるようにするため。
 */
export const RADII_M = [2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000];

/** 緯度1度あたりの距離（m）。経度は緯度によって縮むので後で補正する。 */
const DEG_LAT_M = 111_320;

const EARTH_RADIUS_M = 6_371_000;

export function parseLatLng(params: URLSearchParams): LatLng | null {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function parseLimit(raw: string | null): number {
  // `Number(null)` も `Number("")` も 0 になる。0 は有限なのでそのまま通り、
  // 下の clamp で 1 に丸められる。**省略されたときに1件しか返らない**ので、
  // 数に変換する前に「指定が無い」を弾く。
  if (!raw?.trim()) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.round(Math.min(Math.max(n, 1), MAX_LIMIT));
}

/**
 * 中心から近い順に返す。件数が揃うまで半径を倍々に広げる。
 * 都市部では1回、疎な地域では最大8回の往復になる。
 */
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
          "sourceId", kind, name, address, lat, lng,
          flood, landslide, "stormSurge", earthquake,
          tsunami, fire, "inlandFlood", volcano,
          "sameAddressAsOther", "targetPersons", "otherMatters", note,
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

/** 球面上の距離（ハバサイン）。PostGIS を使わないので式で書く。 */
export function sqlDistanceM(center: LatLng): Prisma.Sql {
  return Prisma.sql`
    ${EARTH_RADIUS_M} * 2 * asin(sqrt(
      power(sin(radians(lat - ${center.lat}) / 2), 2)
      + cos(radians(${center.lat})) * cos(radians(lat))
        * power(sin(radians(lng - ${center.lng}) / 2), 2)
    ))`;
}

/** 円を囲む矩形。索引（lat, lng）が効くのはこの部分だけ。 */
export function bboxAround(center: LatLng, radiusM: number): Bbox {
  const dLat = radiusM / DEG_LAT_M;

  // 経度方向の補正は、中心ではなく矩形の**端**の緯度で取る。中心の緯度で割ると
  // 極側の角が矩形からわずかにはみ出し、そこにある近い避難場所を取りこぼす。
  const edgeLat = Math.min(Math.abs(center.lat) + dLat, 89);
  const dLng = radiusM / (DEG_LAT_M * Math.cos((edgeLat * Math.PI) / 180));

  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lng - dLng,
    east: center.lng + dLng,
  };
}
