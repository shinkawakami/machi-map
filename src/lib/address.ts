/**
 * 住所文字列の正規化。取り込み側と検索側の両方から呼ぶ。
 *
 * 元データ（国土交通省「位置参照情報」大字・町丁目レベル）の表記と、
 * 人が入力する表記のズレを、**同じ関数で同じ形に寄せる**のが目的。
 * 片側だけで正規化すると、寄せ方がずれた瞬間に引けなくなる。
 *
 * 実データで確認したズレ（全国 191,106 件・2026-09-13）:
 * - 「丁目」は漢数字が 91,181 件、算用数字は5件だけ混ざる（例: フェア河増1丁目）
 * - 「大字」で始まる 10,703 件、「字」で始まる 8,007 件。人はこれを省いて書く
 * - 「（大字なし）」のように括弧で注記する行が1件ある
 */

/** 1〜99 を漢数字にする。丁目の表記をデータ側（漢数字）に寄せるために使う。 */
const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function toKanjiNumber(value: number): string {
  if (value < 1 || value > 99) return String(value);
  if (value < 10) return DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens > 1 ? DIGITS[tens] : ""}十${DIGITS[ones]}`;
}

export function normalizeAddress(input: string): string {
  return (
    input
      // 全角英数字・全角スペースをそろえる
      .normalize("NFKC")
      // 「旭ケ丘」と「旭ヶ丘」はどちらでも引けるようにする
      .replace(/[ヶヵ]/g, "ケ")
      // 注記の括弧は落とす（「（大字なし）」など）
      .replace(/[（(][^）)]*[）)]/g, "")
      // 空白・区切り記号は無視する
      .replace(/[\s　・･,、.]/g, "")
      // 人は「大字」「字」を省いて書く
      .replace(/(?<=[都道府県市区町村])(?:大字|字)/g, "")
      .replace(/^(?:大字|字)/, "")
      // 「1丁目」をデータ側の「一丁目」にそろえる
      .replace(/(\d+)丁目/g, (_, n: string) => `${toKanjiNumber(Number(n))}丁目`)
  );
}

/**
 * 住所検索の1件。町丁目の代表点まで。
 *
 * 番地は持たない。答える問いは「近くのどこへ逃げるか」で、その先は近い順が
 * 半径2kmから広げるため、町丁目の代表点と番地の差（数百 m）は
 * 最寄りの順位をほとんど変えない。
 */
export type GeocodeHit = {
  /** 「東京都千代田区内幸町一丁目」の形 */
  label: string;
  prefecture: string;
  municipality: string;
  name: string;
  lat: number;
  lng: number;
};
