import { Prisma } from "@/generated/prisma/client";
import type { ShelterFilter } from "@/lib/filter";
import type { Bbox, LatLng } from "@/lib/geo";

/**
 * `"Shelter"` を生 SQL で引くときの共通部品。
 *
 * 集約（クラスタ）も距離順（近い順）も Prisma のクエリでは書けない
 * （式でグループ化・並べ替えができない）ので `$queryRaw` を使う。
 * 同じ述語と同じ列並びを3か所（クラスタ・近い順・災害別の表）が使うので、
 * **写し間違いが起きない場所に1つだけ置く。**
 */

/** 球面上の距離（ハバサイン）。PostGIS を使わないので式で書く。 */
const EARTH_RADIUS_M = 6_371_000;

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

/**
 * 詳細（ShelterDetail）に要る列。**生 SQL 側の列並びはここだけに書く。**
 * Prisma のクエリから引くときの select は src/server/shelter-detail.ts の
 * DETAIL_SELECT で、そちらと中身をそろえること。
 */
export const DETAIL_COLUMNS = Prisma.sql`
  "sourceId", kind, name, address, lat, lng,
  flood, landslide, "stormSurge", earthquake,
  tsunami, fire, "inlandFlood", volcano,
  "sameAddressAsOther", "targetPersons", "otherMatters", note`;

export function sqlDistanceM(center: LatLng): Prisma.Sql {
  return Prisma.sql`
    ${EARTH_RADIUS_M} * 2 * asin(sqrt(
      power(sin(radians(lat - ${center.lat}) / 2), 2)
      + cos(radians(${center.lat})) * cos(radians(lat))
        * power(sin(radians(lng - ${center.lng}) / 2), 2)
    ))`;
}

/** 矩形だけの述語。索引（lat, lng）が効くのはこの部分。 */
export function sqlWithinBbox(bbox: Bbox): Prisma.Sql {
  return Prisma.sql`lat BETWEEN ${bbox.south} AND ${bbox.north}
    AND lng BETWEEN ${bbox.west} AND ${bbox.east}`;
}

/**
 * 矩形＋絞り込みの述語。
 *
 * Prisma のクエリで書く版（src/server/shelters.ts の whereFor）と**同じ条件を
 * 返すこと**。条件を2つの言語で二重に持つことになるので、片方を変えたら
 * 必ずもう片方も見る。
 *
 * 列は修飾していない。この述語を使うクエリで "Shelter" を他のテーブルと
 * 結合しないこと（結合するなら修飾が要る）。
 */
export function sqlWhereFor(bbox: Bbox, filter: ShelterFilter): Prisma.Sql {
  const conditions = [sqlWithinBbox(bbox)];

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
