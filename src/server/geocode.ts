import { type GeocodeHit, normalizeAddress } from "@/lib/address";
import { prisma } from "@/server/db";

/**
 * 住所から拠点を置くための検索。
 *
 * **実行時に外部のジオコーディング API を叩かない。** 使える規約の API がほとんど無く、
 * 住所検索だけ規約の曖昧な依存を入れると「公開してよいか」の判断がそこだけ戻ってくる
 * （.local/PLAN.md「住所検索のジオコーディング」）。国土交通省の位置参照情報を
 * 自前の Postgres に取り込んで、前方一致で引く。
 *
 * 番地は持たない。答える問いは「近くのどこへ逃げるか」で、その先は近い順が半径2kmから
 * 広げるため、町丁目の代表点と番地の差（数百 m）は最寄りの順位をほとんど変えない。
 */

/** 住所は候補を並べて選ばせるので、近い順（20件）より少し少なめでよい。 */
export const GEOCODE_LIMIT = 10;

const SELECT = {
  prefecture: true,
  municipality: true,
  name: true,
  lat: true,
  lng: true,
} as const;

export async function searchAddress(
  query: string,
  limit = GEOCODE_LIMIT,
): Promise<GeocodeHit[]> {
  const key = normalizeAddress(query);
  // 1文字だと全国の何千件かが並ぶだけで、選ぶ役に立たない。
  if (key.length < 2) return [];

  const hits: GeocodeHit[] = [];
  const seen = new Set<string>();

  const add = (rows: Awaited<ReturnType<typeof find>>) => {
    for (const row of rows) {
      const label = `${row.prefecture}${row.municipality}${row.name}`;
      if (seen.has(label)) continue;
      seen.add(label);
      hits.push({ ...row, label });
    }
  };

  const find = (where: object) =>
    prisma.machiaza.findMany({
      where,
      select: SELECT,
      // 住所の文字列順。同じ市区町村のものが固まって並ぶ。
      orderBy: [{ searchKey: "asc" }],
      take: limit,
    });

  // 1. 「都道府県＋市区町村＋町名」の前方一致。索引が効く本筋。
  add(await find({ searchKey: { startsWith: key } }));

  // 2. 都道府県を省いて「千代田区内幸町」と打つ人のほう多い。ここが本命。
  if (hits.length < limit) {
    add(await find({ cityKey: { startsWith: key } }));
  }

  // 3. 町名だけを打つ人も多い。
  if (hits.length < limit) {
    add(await find({ nameKey: { startsWith: key } }));
  }

  // 4. それでも足りなければ部分一致。索引は効かないが、ここまで来る入力は少ない。
  if (hits.length < limit) {
    add(await find({ searchKey: { contains: key } }));
  }

  return hits.slice(0, limit);
}
