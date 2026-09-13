import { disasterLabel } from "@/lib/disasters";
import { kindOf } from "@/lib/kinds";
import type { ShelterFilter } from "@/lib/shelters";

/**
 * いま何で絞っているかを、UI に出せる形にする。
 *
 * **絞り込みの操作はパネルの中にしか無いが、結果が出るのは地図。**
 * 狭い画面でパネルを畳むと絞り込みバーごと消えるので、点が減っている理由が
 * 画面のどこにも出なくなる。畳んでいなくても、災害別の表を見ているあいだは
 * 目線が表にあって、頭の上のバーは読まれない。
 *
 * そこで**状態のほうを地図に出す**。件数（「このあたりに N 件」）は判断に使われない
 * うえ、絞り込み中はその数字こそ説明を要するので、絞り込み中はここを譲る。
 *
 * **外す口は地図に置かない。** 地図に重ねるのは地図の一部（ピン・現在地・状態）だけで、
 * 操作はパネルに集める、という整理をここで崩さない。状態さえ見えていれば、
 * どこへ行けば外せるかは分かる（絞り込みバーは常に同じ場所にある）。
 *
 * Prisma を持ち込まない純粋な関数に保つこと（クライアントから読む）。
 */

export type FilterBadge = {
  /** どの軸の絞り込みか。React の key に使う */
  key: "disaster" | "kind";
  label: string;
};

export function filterBadges(filter: ShelterFilter): FilterBadge[] {
  const badges: FilterBadge[] = [];

  if (filter.disaster) {
    badges.push({
      key: "disaster",
      /*
        **「洪水で使える場所だけ」とは言わない。** 指定避難所には災害種別の指定が
        無く、災害で絞っているあいだも対象外として残る（lib/shelters.ts の
        sqlWhereFor）。ここで言い切ると、その避難所が洪水で使えると読める。
      */
      label: `${disasterLabel(filter.disaster)}で絞り込み中`,
    });
  }

  if (filter.kinds.length === 1) {
    const kind = kindOf(filter.kinds[0]);
    badges.push({
      key: "kind",
      label: `${kind.shortLabel}だけ表示中`,
    });
  }

  return badges;
}
