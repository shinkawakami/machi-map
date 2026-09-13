import type { ShelterKind } from "@/generated/prisma/enums";
import {
  type DisasterKey,
  disasterLabel,
  encodeDisasters,
  parseDisasters,
} from "@/lib/disasters";
import { kindOf } from "@/lib/kinds";

/**
 * 絞り込みの条件と、その**読み書き**。
 *
 * 同じ条件を、地図・近い順・（サーバー側の）where 句の3か所が扱う。
 * クエリ文字列に落とす側（ブラウザ）と読む側（ルートハンドラ）を同じ場所に置くと、
 * **並びの正規化がずれない**。以前は地図と「近い順」がそれぞれ URLSearchParams を
 * 組み立てていて、同じ条件が別の URL に散る余地があった（CDN は URL をキーにする）。
 *
 * where 句への対応づけだけは DB 側の話なので src/server/shelter-query.ts にある。
 * ここは DB もブラウザ API も触らない。
 */

export const ALL_KINDS: readonly ShelterKind[] = ["EMERGENCY", "SHELTER"];

/**
 * 絞り込みの条件。
 *
 * `disasters` は指定緊急避難場所にしか効かない。指定避難所には災害種別の指定が
 * そもそも存在しない（列自体が無い）ので、絞り込みの対象外として残す。
 * 「この災害では使えない」と「指定がない」を混ぜないための扱いで、
 * 対象外であることは UI 側で明示する。
 *
 * **複数選んだときは AND（選んだ災害の“すべて”で使える場所）。** 理由は2つ。
 *
 * 1. OR だと「洪水か地震のどちらかで使える」になり、地図に出た点を見ても
 *    **どちらの災害で使えるのかが点からは読めない**。このアプリの主張1
 *    （災害の種類ごとに使える・使えないが分かれる）を出すための画面で、
 *    その区別が消える出し方は採れない。AND なら点の意味が1つに決まる
 * 2. **OR は絞り込みとして機能しない。** z8 関東の矩形・指定緊急避難場所
 *    18,887 件で実測すると、洪水 13,073 / 洪水 AND 地震 11,385 /
 *    洪水 AND 地震 AND 津波 2,104 に対し、**同じ3種の OR は 18,434
 *    （全体の 97.6%）**。選ぶほど画面が変わらなくなる
 *
 * 索引は `(lat, lng, kind, 災害種別8種)` に8種すべてが載っているので、条件を
 * 足しても **Index Only Scan のまま**（同じ矩形で Heap Fetches 0・buffers 557→555）。
 */
export type ShelterFilter = {
  /** 表示する種別。空にはならない（空指定は両方として扱う） */
  kinds: ShelterKind[];
  /**
   * 選択中の災害種別。空なら災害種別で絞らない。
   * 並びは DISASTER_TYPES の順に正規化されている（canonicalDisasters）。
   */
  disasters: DisasterKey[];
  /**
   * 受入対象者の定めがある指定避難所（＝指定福祉避難所）だけに絞る。
   *
   * **`disasters` とちょうど裏返しの列。** 災害種別が指定緊急避難場所にしか
   * 無いのと同じように、`targetPersons` は**指定避難所にしか無い**
   * （実データで EMERGENCY 115,829 件すべて null・SHELTER の 11.1% にあたる 9,276 件に値がある）。
   * そのため、これを立てると指定緊急避難場所は1件も残らない。**黙って消さず、
   * UI 側で種別の選択そのものを指定避難所だけに寄せる**（ShelterFilterBar）。
   *
   * **中身では分類しない。** 値は自由記述で 668 通りあり、最多の「要配慮者」
   * （4,409 件・47.5%）は災害対策基本法の総称で、どの層かを名指ししていない。
   * 高齢者／障害者／乳幼児に振り分けると、**元データが持っていない区別を
   * こちらで作る**ことになる。有無だけで絞り、文言そのものは詳細でそのまま見せる。
   */
  welfareOnly: boolean;
};

/** 絞り込みなし（開いた瞬間に中身が入っていることを優先する既定）。 */
export function noFilter(): ShelterFilter {
  return { kinds: [...ALL_KINDS], disasters: [], welfareOnly: false };
}

/**
 * 絞り込みをクエリ文字列に載せる。**地図も「近い順」もここを通す。**
 *
 * 並びは正規化してから載せる（src/lib/disasters.ts）。押した順のままだと同じ
 * 絞り込みが別の URL に散って、bbox を格子に吸着させた意味が薄れる。
 */
export function filterParams(filter: ShelterFilter): URLSearchParams {
  const params = new URLSearchParams({ kinds: filter.kinds.join(",") });
  if (filter.disasters.length > 0) {
    params.set("disaster", encodeDisasters(filter.disasters));
  }
  if (filter.welfareOnly) params.set("welfare", "1");
  return params;
}

/**
 * 絞り込み条件を読む。bbox と違い、不正な値は 400 にせず既定に落とす。
 * 絞り込みは「無ければ全部」が自然な既定を持つので、地図が出ないより無視して出すほうがよい。
 */
export function parseFilter(params: URLSearchParams): ShelterFilter {
  const kinds = (params.get("kinds") ?? "")
    .split(",")
    .filter((v): v is ShelterKind => ALL_KINDS.includes(v as ShelterKind));

  return {
    kinds: kinds.length > 0 ? kinds : [...ALL_KINDS],
    disasters: parseDisasters(params.get("disaster")),
    welfareOnly: params.get("welfare") === "1",
  };
}

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
 */
export type FilterBadge = {
  /** どの軸の絞り込みか。React の key に使う */
  key: "disaster" | "kind";
  label: string;
};

export function filterBadges(filter: ShelterFilter): FilterBadge[] {
  const badges: FilterBadge[] = [];

  if (filter.disasters.length > 0) {
    const names = filter.disasters.map(disasterLabel).join("・");
    badges.push({
      key: "disaster",
      /*
        **「洪水で使える場所だけ」とは言わない。** 指定避難所には災害種別の指定が
        無く、災害で絞っているあいだも対象外として残る（src/server/shelter-query.ts の
        sqlWhereFor）。ここで言い切ると、その避難所が洪水で使えると読める。

        **複数のときは「両方」「すべて」を必ず入れる。** 絞り込みは AND なので、
        名前を並べただけだと「洪水・地震のどちらかで使える」と読まれうる。
        地図に出ている点の意味が反対になるので、ここは字数より正確さを取る。
      */
      label:
        filter.disasters.length === 1
          ? `${names}で絞り込み中`
          : `${names}の${filter.disasters.length === 2 ? "両方" : "すべて"}で絞り込み中`,
    });
  }

  /*
    **福祉避難所の絞り込みは、種別の絞り込みを兼ねる。** 受入対象者は指定避難所に
    しかない列なので、これが立っているときは必ず「避難所だけ」でもある。
    2つ並べても同じことを2回言うだけなので、こちらに寄せる。
  */
  if (filter.welfareOnly) {
    badges.push({ key: "kind", label: "福祉避難所だけ表示中" });
    return badges;
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
