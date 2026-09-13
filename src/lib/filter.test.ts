import { describe, expect, test } from "vitest";

import {
  filterBadges,
  filterParams,
  noFilter,
  parseFilter,
  type ShelterFilter,
} from "@/lib/filter";

/**
 * 絞り込みは**書く側（ブラウザ）と読む側（ルートハンドラ）が同じファイルにある**。
 * 往復して元に戻ることが、この形にした理由そのもの。
 *
 * バッジの文言もここで押さえる。**絞り込みは AND** なので、言い方を間違えると
 * 地図に出ている点の意味が反対に伝わる。
 */

const parse = (params: URLSearchParams) => parseFilter(params);

describe("filterParams / parseFilter", () => {
  test("**往復しても変わらない**", () => {
    const filter: ShelterFilter = {
      kinds: ["EMERGENCY"],
      disasters: ["flood", "tsunami"],
      welfareOnly: false,
    };
    expect(parse(filterParams(filter))).toEqual(filter);
  });

  test("既定（絞り込みなし）も往復する", () => {
    expect(parse(filterParams(noFilter()))).toEqual(noFilter());
  });

  test("福祉避難所も往復する", () => {
    const filter: ShelterFilter = {
      kinds: ["SHELTER"],
      disasters: [],
      welfareOnly: true,
    };
    expect(parse(filterParams(filter))).toEqual(filter);
  });

  test("押した順が違っても、同じクエリ文字列になる", () => {
    const a = filterParams({ ...noFilter(), disasters: ["tsunami", "flood"] });
    const b = filterParams({ ...noFilter(), disasters: ["flood", "tsunami"] });
    expect(a.toString()).toBe(b.toString());
  });

  test("絞り込みが無いときは、余計な引数を載せない", () => {
    const params = filterParams(noFilter());
    expect(params.has("disaster")).toBe(false);
    expect(params.has("welfare")).toBe(false);
  });
});

describe("parseFilter の壊れた入力", () => {
  test("**不正でも 400 にせず既定に落とす**（地図が出ないほうが損）", () => {
    expect(parse(new URLSearchParams("kinds=NOPE&disaster=zzz"))).toEqual(
      noFilter(),
    );
  });

  test("指定が無ければ両方の種別", () => {
    expect(parse(new URLSearchParams()).kinds).toEqual([
      "EMERGENCY",
      "SHELTER",
    ]);
  });

  test("welfare は 1 のときだけ立つ", () => {
    expect(parse(new URLSearchParams("welfare=1")).welfareOnly).toBe(true);
    expect(parse(new URLSearchParams("welfare=true")).welfareOnly).toBe(false);
    expect(parse(new URLSearchParams()).welfareOnly).toBe(false);
  });

  test("読める種別だけ拾う", () => {
    expect(parse(new URLSearchParams("kinds=EMERGENCY,NOPE")).kinds).toEqual([
      "EMERGENCY",
    ]);
  });
});

describe("filterBadges", () => {
  test("絞り込んでいなければ何も出さない", () => {
    expect(filterBadges(noFilter())).toEqual([]);
  });

  test("1種なら、そのまま名前で言う", () => {
    const [badge] = filterBadges({ ...noFilter(), disasters: ["flood"] });
    expect(badge.label).toBe("洪水で絞り込み中");
  });

  test("**2種なら「両方」を必ず入れる**（AND であることが伝わらないと意味が反転する）", () => {
    const [badge] = filterBadges({
      ...noFilter(),
      disasters: ["flood", "earthquake"],
    });
    expect(badge.label).toBe("洪水・地震の両方で絞り込み中");
  });

  test("3種以上なら「すべて」", () => {
    const [badge] = filterBadges({
      ...noFilter(),
      disasters: ["flood", "earthquake", "tsunami"],
    });
    expect(badge.label).toBe("洪水・地震・津波のすべてで絞り込み中");
  });

  test("**「洪水で使える場所だけ」とは言わない**（指定避難所は対象外として残るため）", () => {
    const [badge] = filterBadges({ ...noFilter(), disasters: ["flood"] });
    expect(badge.label).not.toContain("使える");
    expect(badge.label).not.toContain("だけ");
  });

  test("種別を1つに絞ると、そのことを出す", () => {
    const badges = filterBadges({ ...noFilter(), kinds: ["SHELTER"] });
    expect(badges.map((b) => b.label)).toContain("避難所だけ表示中");
  });

  test("福祉避難所は種別の絞り込みを兼ねる（同じことを2回言わない）", () => {
    const badges = filterBadges({
      kinds: ["SHELTER"],
      disasters: [],
      welfareOnly: true,
    });
    expect(badges).toHaveLength(1);
    expect(badges[0].label).toBe("福祉避難所だけ表示中");
  });

  test("災害と種別は並び立つ", () => {
    const badges = filterBadges({
      kinds: ["EMERGENCY"],
      disasters: ["flood"],
      welfareOnly: false,
    });
    expect(badges.map((b) => b.key)).toEqual(["disaster", "kind"]);
  });
});

describe("noFilter", () => {
  test("呼ぶたびに別の配列を返す（共有して書き換えられない）", () => {
    const a = noFilter();
    a.kinds.push("EMERGENCY");
    expect(noFilter().kinds).toEqual(["EMERGENCY", "SHELTER"]);
  });
});
