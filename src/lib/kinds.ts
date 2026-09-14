import type { ShelterKind } from "@/generated/prisma/enums";

type KindMeta = {
  key: ShelterKind;
  label: string;
  /** 狭い場所（フィルタのボタンなど）で使う短い名前 */
  shortLabel: string;
  /**
   * 役割を1行に収める場所で使う最短形（地図の凡例）。
   *
   * description は2つ並べると4行になり、地図に常設できる大きさではない。
   * **落とすのは修飾で、対比は落とさない**（「まず」と「あとで」で時系列が残る）。
   */
  shortDescription: string;
  color: string;
  description: string;
};

/**
 * 種別の表示。このアプリの主張の2つ目
 * 「指定緊急避難場所と指定避難所は別物」を UI で言い切るための文言と色。
 *
 * 説明文は国土地理院・災害対策基本法の定義を短く言い換えたもの。
 * 「逃げ込む場所」と「生活する施設」の対比を崩さないこと。ここを曖昧にすると
 * 2つを混同したまま使われ、このアプリの存在理由が消える。
 *
 * 色は地図の点・凡例・フィルタ・詳細で共通。ここを唯一の出どころにする。
 */
export const KINDS = [
  {
    key: "EMERGENCY",
    label: "指定緊急避難場所",
    shortLabel: "緊急避難場所",
    shortDescription: "まず逃げこむ",
    color: "#ea580c",
    description: "災害の危険から命を守るために、緊急的に逃げ込む場所",
  },
  {
    key: "SHELTER",
    label: "指定避難所",
    shortLabel: "避難所",
    shortDescription: "あとで生活する",
    color: "#1d4ed8",
    description: "自宅に戻れなくなった人が、一定期間 生活する施設",
  },
] as const satisfies readonly KindMeta[];

export function kindOf(key: ShelterKind): (typeof KINDS)[number] {
  return KINDS.find((k) => k.key === key)!;
}
