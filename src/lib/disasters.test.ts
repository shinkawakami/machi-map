import { describe, expect, test } from "vitest";

import {
  canonicalDisasters,
  DISASTER_TYPES,
  type DisasterKey,
  disasterLabel,
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
