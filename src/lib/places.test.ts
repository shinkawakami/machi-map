import { describe, expect, test } from "vitest";

import {
  decodePlaces,
  encodePlaces,
  findPlaceAt,
  makePlace,
  MAX_PLACES,
  type Place,
  placesHash,
  readPlacesParam,
  samePlaces,
  sanitizePlaceName,
} from "@/lib/places";

/**
 * **拠点は URL が正本。** この関数群が壊れると、家族に送った URL を開いた人の
 * 画面で拠点が消えるか、例外で落ちる。送った側は気づけない。
 *
 * URL は人の手で編集されるし、LINE などで途中が切れて届く。
 * 「壊れた入力でも落ちない」ことが機能要件そのものになる。
 */

const HOME: Place = { name: "自宅", lat: 35.658, lng: 139.7016 };
const WORK: Place = { name: "職場", lat: 35.6812, lng: 139.7671 };

describe("sanitizePlaceName", () => {
  test("URL の区切りに使う文字を落とす（percent-encode に頼らない）", () => {
    expect(sanitizePlaceName("自宅,;#?%&")).toBe("自宅");
    expect(sanitizePlaceName("自 宅")).toBe("自宅");
  });

  test("12文字で切る", () => {
    expect(sanitizePlaceName("あ".repeat(20))).toBe("あ".repeat(12));
  });

  test("落とした結果が空になることがある（呼ぶ側が弾く）", () => {
    expect(sanitizePlaceName(",,,")).toBe("");
    expect(sanitizePlaceName("   ")).toBe("");
  });
});

describe("makePlace", () => {
  test("座標を小数4桁に丸める（URL を短くし、精度をそのまま配らない）", () => {
    expect(makePlace("自宅", 35.6581234, 139.7016789)).toEqual({
      name: "自宅",
      lat: 35.6581,
      lng: 139.7017,
    });
  });

  test("名前が空になるものは作らない", () => {
    expect(makePlace(",,,", 35.658, 139.7)).toBeNull();
    expect(makePlace("", 35.658, 139.7)).toBeNull();
  });

  test("座標として成り立たないものは作らない", () => {
    expect(makePlace("自宅", Number.NaN, 139.7)).toBeNull();
    expect(makePlace("自宅", 91, 139.7)).toBeNull();
    expect(makePlace("自宅", 35.658, 181)).toBeNull();
  });
});

describe("encodePlaces / decodePlaces", () => {
  test("往復しても変わらない", () => {
    expect(decodePlaces(encodePlaces([HOME, WORK]))).toEqual([HOME, WORK]);
  });

  test("`名前,緯度,経度;…` の形（読める URL にする）", () => {
    expect(encodePlaces([HOME])).toBe("自宅,35.6580,139.7016");
  });

  test("**壊れた要素は黙って捨て、読める部分だけ残す**", () => {
    expect(decodePlaces("自宅,35.658,139.7016;職場,こわれ")).toEqual([HOME]);
    expect(decodePlaces("自宅,35.658,139.7016;")).toEqual([HOME]);
    expect(decodePlaces(";;;")).toEqual([]);
  });

  test("途中で切れて届いても落ちない", () => {
    expect(() => decodePlaces("自宅,35.65")).not.toThrow();
    expect(decodePlaces("自宅,35.65")).toEqual([]);
  });

  test("指定が無いときは空", () => {
    expect(decodePlaces(null)).toEqual([]);
    expect(decodePlaces("")).toEqual([]);
  });

  test(`上限（${MAX_PLACES}）を超えた URL は、超えたぶんを読まない`, () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      encodePlaces([{ ...HOME, name: `場所${i}` }]),
    ).join(";");
    expect(decodePlaces(many)).toHaveLength(MAX_PLACES);
  });
});

describe("readPlacesParam", () => {
  test("フラグメントから値だけ取り出す", () => {
    expect(readPlacesParam("#s=自宅,35.6580,139.7016")).toBe(
      "自宅,35.6580,139.7016",
    );
  });

  test("# が無くても読む", () => {
    expect(readPlacesParam("s=自宅,35.6580,139.7016")).toBe(
      "自宅,35.6580,139.7016",
    );
  });

  test("ほかの値が混ざっていても s だけ拾う", () => {
    expect(readPlacesParam("#foo=1&s=自宅,35.6580,139.7016&bar=2")).toBe(
      "自宅,35.6580,139.7016",
    );
  });

  test("percent-encode されていても読む（送る側の環境で変わる）", () => {
    expect(readPlacesParam("#s=%E8%87%AA%E5%AE%85,35.6580,139.7016")).toBe(
      "自宅,35.6580,139.7016",
    );
  });

  test("入っていなければ null", () => {
    expect(readPlacesParam("")).toBeNull();
    expect(readPlacesParam("#foo=1")).toBeNull();
  });
});

describe("placesHash", () => {
  test("拠点があれば `#s=…`、無ければ空文字（空の # を残さない）", () => {
    expect(placesHash([HOME])).toBe("#s=自宅,35.6580,139.7016");
    expect(placesHash([])).toBe("");
  });

  test("readPlacesParam と往復する", () => {
    expect(decodePlaces(readPlacesParam(placesHash([HOME, WORK])))).toEqual([
      HOME,
      WORK,
    ]);
  });
});

describe("samePlaces", () => {
  test("中身が同じなら同じ", () => {
    expect(samePlaces([HOME, WORK], [HOME, WORK])).toBe(true);
  });

  test("順番が違えば別（URL の見た目が変わるため）", () => {
    expect(samePlaces([HOME, WORK], [WORK, HOME])).toBe(false);
  });

  test("数が違えば別", () => {
    expect(samePlaces([HOME], [HOME, WORK])).toBe(false);
    expect(samePlaces([], [])).toBe(true);
  });
});

describe("findPlaceAt", () => {
  test("丸めたあとの座標で見る（同じ場所を2回保存させない）", () => {
    expect(findPlaceAt([HOME, WORK], { lat: 35.65801, lng: 139.70163 })).toEqual(
      HOME,
    );
  });

  test("11m 以上離れていれば別の場所", () => {
    expect(findPlaceAt([HOME], { lat: 35.66, lng: 139.7016 })).toBeUndefined();
  });

  test("空なら見つからない", () => {
    expect(findPlaceAt([], HOME)).toBeUndefined();
  });
});
