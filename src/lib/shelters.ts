import { Prisma } from "@/generated/prisma/client";
import type { ShelterKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { type DisasterKey, parseDisasters } from "@/lib/disasters";
import { type Bbox, cellSizeDeg, clamp, snapCells } from "@/lib/grid";

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

const ALL_KINDS: readonly ShelterKind[] = ["EMERGENCY", "SHELTER"];

/** 格子まわりの計算は lib/grid.ts にある（クライアントからも読むため） */
export type { Bbox };

/**
 * 絞り込みの条件。
 *
 * `disasters` は指定緊急避難場所にしか効かない。指定避難所には災害種別の指定が
 * そもそも存在しない（列自体が無い）ので、絞り込みの対象外として残す。
 * 「この災害では使えない」と「指定がない」を混ぜないための扱いで、
 * 対象外であることは UI 側で明示する。
 *
 * **複数選んだときは AND（選んだ災害の“すべて”で使える場所）。** 理由は2つ。
 *
 * 1. OR だと「洪水か地震のどちらかで使える」になり、地図に出た点を見ても
 *    **どちらの災害で使えるのかが点からは読めない**。このアプリの主張1
 *    （災害の種類ごとに使える・使えないが分かれる）を出すための画面で、
 *    その区別が消える出し方は採れない。AND なら点の意味が1つに決まる
 * 2. **OR は絞り込みとして機能しない。** z8 関東の矩形・指定緊急避難場所
 *    18,887 件で実測すると、洪水 13,073 / 洪水 AND 地震 11,385 /
 *    洪水 AND 地震 AND 津波 2,104 に対し、**同じ3種の OR は 18,434
 *    （全体の 97.6%）**。選ぶほど画面が変わらなくなる
 *
 * 索引は `(lat, lng, kind, 災害種別8種)` に8種すべてが載っているので、条件を
 * 足しても **Index Only Scan のまま**（同じ矩形で Heap Fetches 0・buffers 557→555）。
 */
export type ShelterFilter = {
  /** 表示する種別。空にはならない（空指定は両方として扱う） */
  kinds: ShelterKind[];
  /**
   * 選択中の災害種別。空なら災害種別で絞らない。
   * 並びは DISASTER_TYPES の順に正規化されている（canonicalDisasters）。
   */
  disasters: DisasterKey[];
  /**
   * 受入対象者の定めがある指定避難所（＝指定福祉避難所）だけに絞る。
   *
   * **`disasters` とちょうど裏返しの列。** 災害種別が指定緊急避難場所にしか
   * 無いのと同じように、`targetPersons` は**指定避難所にしか無い**
   * （実データで EMERGENCY 115,829 件すべて null・SHELTER の 11.1% にあたる 9,276 件に値がある）。
   * そのため、これを立てると指定緊急避難場所は1件も残らない。**黙って消さず、
   * UI 側で種別の選択そのものを指定避難所だけに寄せる**（ShelterFilterBar）。
   *
   * **中身では分類しない。** 値は自由記述で 668 通りあり、最多の「要配慮者」
   * （4,409 件・47.5%）は災害対策基本法の総称で、どの層かを名指ししていない。
   * 高齢者／障害者／乳幼児に振り分けると、**元データが持っていない区別を
   * こちらで作る**ことになる。有無だけで絞り、文言そのものは詳細でそのまま見せる。
   */
  welfareOnly: boolean;
};

export type ShelterPoint = {
  /** 共通ID。Shelter.id は取り込みのたびに変わるので外には出さない */
  id: string;
  kind: ShelterKind;
  name: string;
  lat: number;
  lng: number;
  /**
   * 同じ座標に、もう一方の種別の指定もある。地図は二色の点で描く。
   * **「1つの施設だ」という意味ではない**（collapseSameSpot を参照）。
   */
  both?: true;
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

/**
 * 横方向をいくつのセルに割るか。クライアントの画面幅から決まるので受け取る。
 *
 * 受け取った値は2の冪に寄せる。クライアントは URL がキャッシュに乗るよう
 * snapCells を通してから送ってくるので、手で組んだ URL でも同じ結果になるように
 * こちらでも同じ丸めをかける。
 */
export function parseCells(raw: string | null): number {
  return snapCells(Number(raw));
}

/**
 * 絞り込み条件を読む。bbox と違い、不正な値は 400 にせず既定に落とす。
 * 絞り込みは「無ければ全部」が自然な既定を持つので、地図が出ないより無視して出すほうがよい。
 */
export function parseFilter(params: URLSearchParams): ShelterFilter {
  const kinds = (params.get("kinds") ?? "")
    .split(",")
    .filter((v): v is ShelterKind => ALL_KINDS.includes(v as ShelterKind));

  return {
    kinds: kinds.length > 0 ? kinds : [...ALL_KINDS],
    disasters: parseDisasters(params.get("disaster")),
    welfareOnly: params.get("welfare") === "1",
  };
}

/**
 * 表示範囲の避難場所を返す。
 * MAX_POINTS 以下なら点そのまま、超えたらグリッド集約に切り替える。
 */
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

/**
 * クラスタ用・近い順検索用の生 SQL 版。集約も距離順も Prisma のクエリでは書けない
 * （式でグループ化・並べ替えができない）ので $queryRaw を使っており、
 * 条件を2つの言語で二重に持つことになる。whereFor と同じ条件を返すこと。
 *
 * 列は修飾していない。この述語を使うクエリで "Shelter" を他のテーブルと
 * 結合しないこと（結合するなら修飾が要る）。
 */
export function sqlWhereFor(bbox: Bbox, filter: ShelterFilter): Prisma.Sql {
  const conditions = [
    Prisma.sql`lat BETWEEN ${bbox.south} AND ${bbox.north}`,
    Prisma.sql`lng BETWEEN ${bbox.west} AND ${bbox.east}`,
  ];

  if (filter.kinds.length === 1) {
    conditions.push(Prisma.sql`kind = ${filter.kinds[0]}::"ShelterKind"`);
  }

  if (filter.disasters.length > 0) {
    // 列名を SQL に直接埋めるが、値は parseFilter が DISASTER_TYPES の8種に
    // 限っているので任意の文字列は入らない。
    // 複数は AND（選んだ災害のすべてで使える場所）。whereFor と同じ条件にすること。
    const flags = Prisma.join(
      filter.disasters.map(
        (key) => Prisma.sql`${Prisma.raw(`"${key}"`)} = true`,
      ),
      " AND ",
    );
    conditions.push(
      Prisma.sql`(kind = 'SHELTER'::"ShelterKind" OR (${flags}))`,
    );
  }

  if (filter.welfareOnly) {
    // 索引に "targetPersons" を載せてあるので Index Only Scan のまま
    // （載せる前は z8 関東で Parallel Seq Scan・buffers 4,836 に落ちていた）。
    conditions.push(Prisma.sql`"targetPersons" IS NOT NULL`);
  }

  return Prisma.join(conditions, " AND ");
}

/** 小数5桁 ≒ 1m。これ以上の桁は転送量になるだけで地図では見えない。 */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
