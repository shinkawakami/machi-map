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

/**
 * 一覧の1行に収まる形で「対応する災害」を言う（「近い順」の各行）。
 *
 * **全部並べると2割が途中で切れ、そこで意味が変わる。** 副題は 13px・幅 288px の
 * `truncate` で、およそ22字までしか出ない。実測すると列挙の文字数は p90 が25字で、
 * **20.8% が切れる**。「洪水・土砂災害・高潮・地震・津波・大規模な火事」が
 * 「洪水・土砂災害・高潮…」で止まると、**落ちた災害が読めないまま、残った先頭だけが
 * 答えの顔をする**。住所が切れる（0.2%）のとは性質が違い、これは嘘になる。
 *
 * そこで**先に畳んで、切れないようにする**。件数の実測分布は
 * 1種 20,429 / 2種 22,235 / 3種 21,437 / 4種以上 51,728 で、
 * **3種までが 55.3%**。そこまではそのまま並べても最長16字に収まる
 * （「土砂災害・大規模な火事・内水氾濫」）。4種以上は先頭2つと残りの数にする。
 * こちらも最長16字（「土砂災害・大規模な火事 ほか6種」）。
 *
 * 8種すべてのときだけ数えさせない。src/lib/summary.ts の groupTitle と同じ言い方。
 */
export function disasterSummary(keys: readonly DisasterKey[]): string {
  if (keys.length === 0) return "対応する災害の指定なし";
  if (keys.length === DISASTER_TYPES.length) {
    return `${DISASTER_TYPES.length}種すべて`;
  }

  const labels = keys.map(disasterLabel);
  if (labels.length <= 3) return labels.join("・");
  return `${labels.slice(0, 2).join("・")} ほか${labels.length - 2}種`;
}
