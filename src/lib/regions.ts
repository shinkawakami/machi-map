import { prisma } from "@/lib/db";

/**
 * 都道府県・市区町村から地図を飛ばすための一覧。
 *
 * 全国から目的の街まで拡大していくのは手間が大きく、
 * 「場所を決める」ところで止まってしまう。名前から一発で寄れる道を用意する。
 *
 * 市町村の位置は**避難場所の座標から求める**。市町村マスタは代表点を持たないが、
 * このアプリが寄りたいのは役所の位置ではなく「避難場所が載っている範囲」なので、
 * 実際のデータの外接矩形のほうが目的に合っている。
 * 避難場所が1件も無い市町村（データ未登録の21）は寄っても空なので載せない。
 */

export type AreaBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export type MunicipalityArea = AreaBounds & { code: string; name: string };

/**
 * 都道府県は名前と市区町村の入れ物だけ。**矩形は持たせない。**
 * 東京都の外接矩形は小笠原・沖ノ鳥島まで含んで南北9度に及び、
 * そこへ合わせると太平洋の真ん中に寄る。県で地図を動かす意味がない。
 */
export type PrefectureArea = { name: string; municipalities: MunicipalityArea[] };

type Row = AreaBounds & { code: string; prefecture: string; name: string };

/**
 * 199,116 行の集約になるので、プロセス内に持っておく。
 * 元データの更新は月1回で、その取り込みのたびにデプロイし直す運用にしている。
 */
let cached: Promise<PrefectureArea[]> | null = null;

export function listRegions(): Promise<PrefectureArea[]> {
  cached ??= query();
  return cached;
}

async function query(): Promise<PrefectureArea[]> {
  // コード順に並べると、都道府県は北海道→沖縄、市区町村は県内の標準的な並びになる。
  // 座標は小数4桁（約11m）に丸める。地図を寄せるだけなので精度は足り、
  // 1,726件ぶんの JSON が目に見えて軽くなる。
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT m.code,
           m.prefecture,
           m.name,
           ROUND(MIN(s.lat)::numeric, 4)::float8 AS "minLat",
           ROUND(MAX(s.lat)::numeric, 4)::float8 AS "maxLat",
           ROUND(MIN(s.lng)::numeric, 4)::float8 AS "minLng",
           ROUND(MAX(s.lng)::numeric, 4)::float8 AS "maxLng"
      FROM "Municipality" m
      JOIN "Shelter" s ON s."municipalityCode" = m.code
     GROUP BY m.code, m.prefecture, m.name
     ORDER BY m.code
  `;

  const byPrefecture = new Map<string, PrefectureArea>();
  for (const row of rows) {
    const area: MunicipalityArea = {
      code: row.code,
      name: row.name,
      minLat: row.minLat,
      maxLat: row.maxLat,
      minLng: row.minLng,
      maxLng: row.maxLng,
    };

    const prefecture = byPrefecture.get(row.prefecture);
    if (prefecture) {
      prefecture.municipalities.push(area);
    } else {
      byPrefecture.set(row.prefecture, {
        name: row.prefecture,
        municipalities: [area],
      });
    }
  }

  return [...byPrefecture.values()];
}
