import type { ShelterKind } from "@/generated/prisma/enums";
import { DISASTER_TYPES, type DisasterKey } from "@/lib/disasters";
import type { PlaceDetail, ShelterDetail } from "@/lib/shelter";
import { prisma } from "@/server/db";

/**
 * `"Shelter"` の1行を、外に出す形（src/lib/shelter.ts の ShelterDetail）に変える。
 * 地図の点を押したときと、近い順の一覧の各行で同じものを見せる。
 */

/**
 * findMany / findUnique の select。
 * 生 SQL 側の列並び（src/server/shelter-query.ts の DETAIL_COLUMNS）とそろえること。
 */
export const DETAIL_SELECT = {
  sourceId: true,
  // もう一方の指定を引くときの絞り込みに使う（name/address に索引が無いので、
  // 市町村で絞ってから突き合わせる）。詳細そのものには出さない。
  municipalityCode: true,
  kind: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  flood: true,
  landslide: true,
  stormSurge: true,
  earthquake: true,
  tsunami: true,
  fire: true,
  inlandFlood: true,
  volcano: true,
  sameAddressAsOther: true,
  targetPersons: true,
  otherMatters: true,
  note: true,
} as const;

export type DetailRow = {
  sourceId: string;
  kind: ShelterKind;
  name: string;
  address: string;
  lat: number;
  lng: number;
  sameAddressAsOther: boolean;
  targetPersons: string | null;
  otherMatters: string | null;
  note: string | null;
} & Record<DisasterKey, boolean | null>;

export function toDetail(row: DetailRow): ShelterDetail {
  return {
    id: row.sourceId,
    kind: row.kind,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    disasters:
      row.kind === "SHELTER"
        ? null
        : DISASTER_TYPES.filter((d) => row[d.key]).map((d) => d.key),
    sameAddressAsOther: row.sameAddressAsOther,
    targetPersons: row.targetPersons,
    otherMatters: row.otherMatters,
    note: row.note,
  };
}

export async function fetchDetail(
  sourceId: string,
): Promise<PlaceDetail | null> {
  const row = await prisma.shelter.findUnique({
    where: { sourceId },
    select: DETAIL_SELECT,
  });
  if (!row) return null;

  /*
    同じ施設のほかの指定を引く。**鍵は名前＋住所**で、地図と一覧がまとめるときと
    同じ条件（src/server/shelters.ts の collapsePoints、src/server/nearby.ts の mergeSameFacility）。
    ここだけ条件が違うと、まとめて出したのに中身が出ない組が生まれる。

    **市町村コードを先に置く。** name / address には索引が無く、そのまま引くと
    全国 199,116 行の Seq Scan になる。municipalityCode は索引があり、
    1市町村あたり百数十行なので、そこまで絞ってから名前と住所で突き合わせる
    （実測 0.15ms）。

    種別では絞らない。同じ種別の指定が複数あることがある（通常の指定避難所と
    指定福祉避難所など）。

    住所だけが同じ（名前は違う）ものは、ここでは拾わない。
    「南町中学校（体育館等）」と「南町中学校」のように**建物のどこが指定されているかが
    違う**ことがあり、同じものとして並べるのは嘘になる。そちらは従来どおり
    sameAddressAsOther の断り書きで伝える。
  */
  const others = await prisma.shelter.findMany({
    where: {
      municipalityCode: row.municipalityCode,
      name: row.name,
      address: row.address,
      sourceId: { not: sourceId },
    },
    select: DETAIL_SELECT,
  });

  return { ...toDetail(row), others: others.map(toDetail) };
}
