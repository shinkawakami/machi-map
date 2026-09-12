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

/** findMany / findUnique の select。生 SQL 側の列とそろえること。 */
export const DETAIL_SELECT = {
  sourceId: true,
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
): Promise<ShelterDetail | null> {
  const row = await prisma.shelter.findUnique({
    where: { sourceId },
    select: DETAIL_SELECT,
  });
  return row ? toDetail(row) : null;
}
