import { DISASTER_TYPES, type DisasterKey, disasterLabel } from "@/lib/disasters";
import type { NearbyItem } from "@/lib/nearby";
import type { SummaryRow } from "@/lib/place-summary";

/**
 * 「8種 × 最寄り」を読める形に畳む。画面（ShelterPanel）と紙（PrintSheet）で共有する。
 *
 * サーバー側（lib/place-summary.ts）は8種ぶんを素直に8行で返す。**そのまま8行出すと、
 * このアプリがいちばん見せたい差が消える。** 全国の指定避難所の位置を居住地の代わりに
 * 300点サンプリングして、8種それぞれの最寄りを引いて数えた結果:
 *
 * | 8行に出てくる施設の数 | 割合 |
 * |---|---|
 * | 1施設（8行とも同じ名前） | 35.7% |
 * | 2施設以下 | 57.0% |
 * | 5施設以上 | 15.0% |
 *
 * 3人に1人は**同じ小学校が8回並んだ表**を受け取る。「災害の種類ごとに使える・使えないが
 * 分かれる」という主張が、それを言うための画面で消えていた。**同じ施設は1行に束ね、
 * 違う行だけを立てる。**
 *
 * Prisma を持ち込まない純粋な関数に保つこと（クライアントから読む）。
 */

/**
 * 「近く」と言い切れる距離（m）。
 *
 * 半径のはしごは 256km まで伸びる（lib/nearby.ts の RADII_M）。**その災害の指定が
 * 自分の市町村に無いと、隣やその先の市町村の指定を拾って、それを最寄りとして返す。**
 * 上と同じ標本で測ると、最寄りまでの距離は 1km 以内が 66.6%・2km 以内が 72.1% に
 * かたまり、そこから 3〜8km が薄く（7.1%）、8〜15km にもう一つの山（15.6%）が立つ。
 * 後ろの山は「自分の市町村がその災害を指定していない」ぶんで、**答えではない**。
 *
 * 谷が薄いので境目の数字は効きにくい。徒歩で向かえるか（3km でおよそ40分）を基準に
 * 3km を採る。これを超えたものは、距離だけ添えて「近くにありません」として出す。
 * 500m の小学校と 12km 先の公園が同じ列・同じ書式で並ぶのをやめるのが目的なので、
 * 拾ったこと自体は隠さない（その災害の指定がどこにあるかは、それはそれで知りたい）。
 */
export const NEARBY_LIMIT_M = 3000;

/** 同じ施設に落ちた災害をまとめた1行。 */
export type SummaryGroup = {
  /** この行にまとまった災害。並びは国土地理院 CSV の列順のまま */
  disasters: DisasterKey[];
  /** 最寄り。はしごの端まで広げても無ければ null */
  item: NearbyItem | null;
  /** 見つかってはいるが、逃げ先と呼べる距離ではない */
  far: boolean;
};

export function groupSummaryRows(rows: readonly SummaryRow[]): SummaryGroup[] {
  const groups: SummaryGroup[] = [];
  const byItem = new Map<string, SummaryGroup>();
  /** 見つからなかったものは、施設が無いので1つにまとめる */
  let missing: SummaryGroup | null = null;

  for (const row of rows) {
    const item = row.nearest;

    if (!item) {
      if (!missing) {
        missing = { disasters: [], item: null, far: false };
        groups.push(missing);
      }
      missing.disasters.push(row.disaster);
      continue;
    }

    let group = byItem.get(item.id);
    if (!group) {
      group = { disasters: [], item, far: isFar(item) };
      byItem.set(item.id, group);
      groups.push(group);
    }
    group.disasters.push(row.disaster);
  }

  /*
    近い順に並べ替える。**上から読めば、そのまま答えになる。**
    遠い行と見つからなかった行は自然に下へ落ち、「近くにありません」がまとまって
    末尾に並ぶ。sort は安定なので、距離が同じ行は CSV の列順のまま残る。
  */
  return groups.sort((a, b) => distanceOf(a) - distanceOf(b));
}

export function isFar(item: NearbyItem): boolean {
  return item.distanceM > NEARBY_LIMIT_M;
}

/** 行の見出し。8種すべてが1つに落ちたときは、並べずにそう言う。 */
export function groupTitle(group: SummaryGroup): string {
  if (group.disasters.length === DISASTER_TYPES.length) {
    return `${DISASTER_TYPES.length}種すべての災害`;
  }
  return group.disasters.map((key) => disasterLabel(key)).join("・");
}

function distanceOf(group: SummaryGroup): number {
  return group.item ? group.item.distanceM : Number.POSITIVE_INFINITY;
}
