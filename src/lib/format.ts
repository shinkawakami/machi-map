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
