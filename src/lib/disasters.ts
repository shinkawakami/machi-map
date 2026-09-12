/**
 * 指定緊急避難場所の災害種別8種。
 *
 * このアプリの主張の1つ目「避難場所は災害の種類ごとに使える・使えないが分かれている」を
 * 扱う中心のデータ。`key` は Shelter の列名とそろえてある（クエリ文字列にもそのまま使う）。
 * 順序は国土地理院 CSV の列順のまま。並べ替える理由がないし、出典と突き合わせやすい。
 *
 * ここは Prisma を持ち込まない純粋なデータに保つ。クライアント側の
 * フィルタ UI からも読むので、サーバー専用のものを混ぜるとバンドルに入る。
 * where 句への対応づけは lib/shelters.ts 側に置いてある。
 */
export const DISASTER_TYPES = [
  { key: "flood", label: "洪水", sourceLabel: "洪水" },
  {
    key: "landslide",
    label: "土砂災害",
    sourceLabel: "崖崩れ、土石流及び地滑り",
  },
  { key: "stormSurge", label: "高潮", sourceLabel: "高潮" },
  { key: "earthquake", label: "地震", sourceLabel: "地震" },
  { key: "tsunami", label: "津波", sourceLabel: "津波" },
  { key: "fire", label: "大規模な火事", sourceLabel: "大規模な火事" },
  { key: "inlandFlood", label: "内水氾濫", sourceLabel: "内水氾濫" },
  { key: "volcano", label: "火山現象", sourceLabel: "火山現象" },
] as const;

export type DisasterKey = (typeof DISASTER_TYPES)[number]["key"];

const KEYS: readonly string[] = DISASTER_TYPES.map((d) => d.key);

export function isDisasterKey(value: string): value is DisasterKey {
  return KEYS.includes(value);
}

export function disasterLabel(key: DisasterKey): string {
  return DISASTER_TYPES.find((d) => d.key === key)!.label;
}
