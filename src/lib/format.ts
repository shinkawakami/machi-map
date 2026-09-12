/**
 * 距離の表示。
 *
 * 1km 未満は m、それ以上は km 表示にする。元データの座標には小数2桁（約1km 精度）の
 * 行が10件あるので、m 単位の桁を信用しすぎない書き方にとどめる。
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters / 1000)}km`;
}

/**
 * 日付の表示。
 *
 * 元データの日付列は Date 型（時刻を持たない）で、Prisma からは UTC の 0 時として返る。
 * ローカル時刻で組み立てると、日本時間では1日ずれる。UTC のまま読むこと。
 */
export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

/** 桁区切り。表示する場所で locale の既定に振り回されないよう ja-JP を明示する。 */
export function formatCount(n: number): string {
  return n.toLocaleString("ja-JP");
}
