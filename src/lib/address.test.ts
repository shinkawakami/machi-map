import { describe, expect, test } from "vitest";

import { normalizeAddress } from "@/lib/address";

/**
 * **取り込み側と検索側の両方がこの関数を通る。** 片側だけ寄せ方がずれた瞬間に、
 * 住所検索が黙って0件になる。例外も出ず、画面は「該当する町名が見つかりません」と
 * 正しく表示するので、テスト以外で気づく方法がほとんど無い。
 *
 * 実データで確認したズレ（全国 191,106 件・2026-09-13）に対応している。
 */

describe("normalizeAddress", () => {
  test("ヶ / ヵ を ケ に寄せる（「旭ケ丘」と「旭ヶ丘」をどちらでも引けるように）", () => {
    expect(normalizeAddress("旭ヶ丘")).toBe("旭ケ丘");
    expect(normalizeAddress("旭ヵ丘")).toBe("旭ケ丘");
    expect(normalizeAddress("旭ケ丘")).toBe("旭ケ丘");
  });

  test("全角の英数字・スペースをそろえる（NFKC）", () => {
    expect(normalizeAddress("１丁目")).toBe("一丁目");
    expect(normalizeAddress("ＡＢＣ町")).toBe("ABC町");
  });

  test("算用数字の丁目をデータ側の漢数字に寄せる", () => {
    expect(normalizeAddress("内幸町1丁目")).toBe("内幸町一丁目");
    expect(normalizeAddress("本町10丁目")).toBe("本町十丁目");
    expect(normalizeAddress("本町21丁目")).toBe("本町二十一丁目");
    expect(normalizeAddress("本町20丁目")).toBe("本町二十丁目");
  });

  test("人が省いて書く「大字」「字」を落とす", () => {
    expect(normalizeAddress("千代田区大字内幸町")).toBe("千代田区内幸町");
    expect(normalizeAddress("大字本町")).toBe("本町");
    expect(normalizeAddress("字本町")).toBe("本町");
  });

  test("括弧の注記を落とす（「（大字なし）」が実データに1件ある）", () => {
    expect(normalizeAddress("（大字なし）本町")).toBe("本町");
    expect(normalizeAddress("本町(その他)")).toBe("本町");
  });

  test("空白や区切り記号は無視する", () => {
    expect(normalizeAddress("千代田区 内幸町")).toBe("千代田区内幸町");
    expect(normalizeAddress("千代田区　内幸町")).toBe("千代田区内幸町");
    expect(normalizeAddress("千代田区・内幸町")).toBe("千代田区内幸町");
    expect(normalizeAddress("東京都,千代田区")).toBe("東京都千代田区");
  });

  test("**書き方が違っても同じ鍵に落ちる**（これが目的そのもの）", () => {
    const expected = "東京都千代田区内幸町一丁目";
    for (const input of [
      "東京都千代田区内幸町一丁目",
      "東京都 千代田区 内幸町1丁目",
      "東京都千代田区大字内幸町１丁目",
      "東京都・千代田区・内幸町一丁目",
    ]) {
      expect(normalizeAddress(input)).toBe(expected);
    }
  });

  test("**冪等**（2回通しても変わらない）", () => {
    // 取り込み側で正規化済みの値を、検索側がもう一度通すことがある。
    for (const input of [
      "東京都千代田区内幸町1丁目",
      "旭ヶ丘",
      "（大字なし）本町",
      "大字本町10丁目",
    ]) {
      const once = normalizeAddress(input);
      expect(normalizeAddress(once)).toBe(once);
    }
  });

  test("空文字でも落ちない", () => {
    expect(normalizeAddress("")).toBe("");
  });
});
