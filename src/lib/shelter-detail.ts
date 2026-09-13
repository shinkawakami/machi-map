import type { ShelterKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { DISASTER_TYPES, type DisasterKey } from "@/lib/disasters";

/**
 * 1つの指定の中身。地図の点を押したときと、近い順の一覧の各行で同じものを見せる。
 *
 * `disasters` を「空配列」ではなく null にできるようにしているのが要点。
 * 指定避難所には災害種別の指定がそもそも存在しないので、
 * 「どの災害でも使えない」（空配列）と混ぜてはいけない。DB の nullable と同じ理由。
 */
export type ShelterDetail = {
  /** 共通ID。Shelter.id は取り込みのたびに変わるので外には出さない */
  id: string;
  kind: ShelterKind;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** 対応する災害種別。kind=SHELTER のときは null（指定という概念がない） */
  disasters: DisasterKey[] | null;
  /** もう一方のデータセットに住所が同じ指定がある（同一施設とは限らない） */
  sameAddressAsOther: boolean;
  /** 受入対象者（指定福祉避難所のみ） */
  targetPersons: string | null;
  /** その他市町村長が必要と認める事項 */
  otherMatters: string | null;
  note: string | null;
};

/**
 * 1つの場所が持っている指定を、まとめて返す形。
 *
 * 地図でも一覧でも、**同じ施設（名前＋住所が一致）の指定は1つにまとめて出す**。
 * まとめた以上、押した先で1つしか出ないと**ほかの指定にしか無い項目が消える**
 * （受入対象者は指定福祉避難所、その他市町村長が必要と認める事項は指定避難所の列）。
 *
 * **2つとは限らない。** 同じ名前・住所に指定避難所が2つ（通常と福祉避難所）ある
 * 施設が実データで 1,484 あり、うち 1,125 行が受入対象者を持つ。
 * 「もう一方」ではなく、残り全部を配列で持つ。
 */
export type PlaceDetail = ShelterDetail & {
  /** 同じ名前・同じ住所にある、ほかの指定。無ければ空 */
  others: ShelterDetail[];
};

/** findMany / findUnique の select。生 SQL 側の列とそろえること。 */
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
    同じ条件（lib/shelters.ts の collapsePoints、lib/nearby.ts の mergeSameFacility）。
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
