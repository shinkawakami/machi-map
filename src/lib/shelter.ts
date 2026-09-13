import type { ShelterKind } from "@/generated/prisma/enums";
import type { DisasterKey } from "@/lib/disasters";

/**
 * 公開 API がやりとりする形。**ここは型だけを置く。**
 *
 * 作る側（src/server）と読む側（src/client・画面）の両方から読むので、
 * DB もブラウザ API も持ち込まない。以前は型が問い合わせの実装（prisma を引く
 * モジュール）の中に住んでいて、クライアントが `import type` でそこへ手を伸ばして
 * いた。型だけなら消えるので動きはするが、**うっかり値を1つ import した瞬間に
 * Prisma がブラウザのバンドルに入る**。境界をコメントで守るのをやめて、
 * 置き場所で守る。
 */

/** 地図に出す1点。転送量のために、名前と種別しか持たない。 */
export type ShelterPoint = {
  /** 共通ID。Shelter.id は取り込みのたびに変わるので外には出さない */
  id: string;
  kind: ShelterKind;
  name: string;
  lat: number;
  lng: number;
  /**
   * 同じ座標に、もう一方の種別の指定もある。地図は二色の点で描く。
   * **「1つの施設だ」という意味ではない**（src/server/shelters.ts の collapsePoints を参照）。
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

export type NearbyItem = ShelterDetail & {
  distanceM: number;
  /**
   * 同じ場所・同じ名前で、もう一方の種別の指定もある（1行にまとめてある）。
   * まとめる条件は src/server/nearby.ts の mergeSameFacility を参照。
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

export type SummaryRow = {
  disaster: DisasterKey;
  /** 上限まで広げても見つからなければ null */
  nearest: NearbyItem | null;
};

/**
 * 拠点ごとの「8種の災害 × それぞれの最寄り」。
 *
 * このアプリで**持ち帰れるもの**にあたる部分。
 * 1地点ぶんの地図を見せて終わりにすると、調べ終わったあとに何も残らず、
 * 次に開く理由がなくなる（.local/PLAN.md「利用シーンの整理」の壁4）。
 * 8種ぶんまとめて出せば、そのまま家族に送れて、紙にも出せる。
 *
 * 災害種別を持つのは指定緊急避難場所だけなので、表の本体はそちら。
 * 指定避難所（生活する場所）は別枠で最寄りを1件だけ添える。
 */
export type PlaceSummary = {
  /** 最後に使った半径（m）。どこまで広げたのかは UI で見せる */
  radiusM: number;
  /** 埋まらなかった災害種別があるか */
  incomplete: boolean;
  /** DISASTER_TYPES と同じ並び（国土地理院 CSV の列順） */
  rows: SummaryRow[];
  /** 指定避難所の最寄り。災害種別の指定はない */
  shelter: NearbyItem | null;
};
