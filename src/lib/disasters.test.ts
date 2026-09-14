import { describe, expect, test } from "vitest";

import {
  canonicalDisasters,
  DISASTER_TYPES,
  type DisasterKey,
  disasterLabel,
  disasterSummary,
  encodeDisasters,
  isDisasterKey,
  parseDisasters,
} from "@/lib/disasters";

/**
 * 並びの正規化が外れても画面は正しく動く。**壊れるのはキャッシュ**で、
 * `flood,earthquake` と `earthquake,flood` が別の URL に散る。
 * 8種から選ぶ順列は最大 40,320 通りある。
 */

describe("DISASTER_TYPES", () => {
  test("8種。国土地理院 CSV の列順のまま", () => {
    expect(DISASTER_TYPES).toHaveLength(8);
    expect(DISASTER_TYPES.map((d) => d.key)).toEqual([
      "flood",
      "landslide",
      "stormSurge",
      "earthquake",
      "tsunami",
      "fire",
      "inlandFlood",
      "volcano",
    ]);
  });

  test("key が Shelter の列名とそろっている（クエリ文字列にそのまま出る）", () => {
    for (const d of DISASTER_TYPES) {
      expect(d.key).toMatch(/^[a-z][A-Za-z]*$/);
    }
  });
});

describe("canonicalDisasters", () => {
  test("押した順ではなく CSV の列順に並べ直す", () => {
    expect(canonicalDisasters(["tsunami", "flood"])).toEqual([
      "flood",
      "tsunami",
    ]);
    expect(canonicalDisasters(["volcano", "flood", "earthquake"])).toEqual([
      "flood",
      "earthquake",
      "volcano",
    ]);
  });

  test("重複を落とす", () => {
    expect(canonicalDisasters(["flood", "flood"])).toEqual(["flood"]);
  });

  test("知らない値は黙って捨てる（手で組んだ URL で地図が出ないほうが損）", () => {
    expect(canonicalDisasters(["flood", "meteor"])).toEqual(["flood"]);
    expect(canonicalDisasters([])).toEqual([]);
  });

  test("**どの順で渡しても同じ結果になる**（正規化の本体）", () => {
    const chosen: DisasterKey[] = ["tsunami", "flood", "volcano"];
    const shuffled: DisasterKey[] = ["volcano", "tsunami", "flood"];
    expect(canonicalDisasters(shuffled)).toEqual(canonicalDisasters(chosen));
  });
});

describe("encodeDisasters / parseDisasters", () => {
  test("往復しても変わらない", () => {
    const keys: DisasterKey[] = ["flood", "earthquake", "tsunami"];
    expect(parseDisasters(encodeDisasters(keys))).toEqual(keys);
  });

  test("押した順が違っても、同じクエリ文字列になる", () => {
    expect(encodeDisasters(["tsunami", "flood"])).toBe(
      encodeDisasters(["flood", "tsunami"]),
    );
  });

  test("空なら空文字（呼ぶ側が載せない判断をする）", () => {
    expect(encodeDisasters([])).toBe("");
  });

  test("単一だったころの `?disaster=flood` もそのまま通る", () => {
    expect(parseDisasters("flood")).toEqual(["flood"]);
  });

  test("指定が無いときは空", () => {
    expect(parseDisasters(null)).toEqual([]);
    expect(parseDisasters("")).toEqual([]);
  });

  test("壊れた値が混ざっても、読める部分だけ拾う", () => {
    expect(parseDisasters("flood,,meteor,tsunami")).toEqual([
      "flood",
      "tsunami",
    ]);
  });
});

describe("isDisasterKey / disasterLabel", () => {
  test("8種だけを受け付ける", () => {
    expect(isDisasterKey("flood")).toBe(true);
    expect(isDisasterKey("shelter")).toBe(false);
  });

  test("すべての key に日本語のラベルがある", () => {
    for (const d of DISASTER_TYPES) {
      expect(disasterLabel(d.key)).toBe(d.label);
      expect(disasterLabel(d.key)).not.toBe("");
    }
  });
});

describe("disasterSummary", () => {
  test("3種までは、そのまま並べる（実データの 55.3%）", () => {
    expect(disasterSummary(["flood"])).toBe("洪水");
    expect(disasterSummary(["flood", "landslide"])).toBe("洪水・土砂災害");
    expect(disasterSummary(["flood", "landslide", "stormSurge"])).toBe(
      "洪水・土砂災害・高潮",
    );
  });

  test("4種以上は、先頭2つと残りの数にする", () => {
    expect(
      disasterSummary(["flood", "landslide", "stormSurge", "earthquake"]),
    ).toBe("洪水・土砂災害 ほか2種");
  });

  test("8種すべてのときは数えさせない", () => {
    expect(disasterSummary(DISASTER_TYPES.map((d) => d.key))).toBe("8種すべて");
  });

  /**
   * ここが目的。副題は 13px・幅 288px の truncate でおよそ22字しか出ず、
   * 切れると落ちた災害が読めないまま先頭だけが残る。**どう選んでも切れないこと**を
   * 押さえておく（全 255 通りを総当たりする）。
   */
  test("どの組み合わせでも、1行に収まる長さ（22字以下）で返す", () => {
    const keys = DISASTER_TYPES.map((d) => d.key);
    let longest = "";

    for (let mask = 1; mask < 1 << keys.length; mask++) {
      const chosen = keys.filter((_, i) => mask & (1 << i));
      const text = disasterSummary(chosen);
      if (text.length > longest.length) longest = text;
    }

    expect(longest.length).toBeLessThanOrEqual(22);
  });

  test("0種は起きない想定だが、空文字を返さない", () => {
    expect(disasterSummary([])).toBe("対応する災害の指定なし");
  });
});
