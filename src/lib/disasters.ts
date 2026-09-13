/**
 * 指定緊急避難場所の災害種別8種。
 *
 * このアプリの主張の1つ目「避難場所は災害の種類ごとに使える・使えないが分かれている」を
 * 扱う中心のデータ。`key` は Shelter の列名とそろえてある（クエリ文字列にもそのまま使う）。
 * 順序は国土地理院 CSV の列順のまま。並べ替える理由がないし、出典と突き合わせやすい。
 *
 * where 句への対応づけは src/server/shelter-query.ts 側に置いてある。
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

/**
 * 選んだ災害種別を **DISASTER_TYPES の順に並べ直し、重複を落とす。**
 *
 * **並びを固定するのはキャッシュのため。** 絞り込みはクエリ文字列に出て、
 * CDN は URL をキーにする（src/server/http-cache.ts）。押した順のまま並べると
 * `flood,earthquake` と `earthquake,flood` が別の URL になり、同じ問い合わせが
 * 2つのキーに散る。8種から選ぶと順列は最大 40,320 通りあるので、
 * 丸めずに置くと bbox を格子に吸着させた意味が薄れる（src/lib/geo.ts と同じ話）。
 *
 * 並べ替えの基準に CSV の列順を使うのは、ここが唯一の出どころだから。
 * UI の表示順もこれなので、URL を見たときに画面と同じ順で読める。
 */
export function canonicalDisasters(keys: readonly string[]): DisasterKey[] {
  const wanted = new Set(keys);
  return DISASTER_TYPES.map((d) => d.key).filter((key) => wanted.has(key));
}

/** クエリ文字列に載せる形。空なら空文字（呼ぶ側が載せない判断をする）。 */
export function encodeDisasters(keys: readonly DisasterKey[]): string {
  return canonicalDisasters(keys).join(",");
}

/**
 * クエリ文字列から読む。知らない値は黙って捨てる。
 * 単一だったころの `?disaster=flood` もそのまま通る（1要素として読める）。
 */
export function parseDisasters(raw: string | null): DisasterKey[] {
  if (!raw) return [];
  return canonicalDisasters(raw.split(",").filter(isDisasterKey));
}
