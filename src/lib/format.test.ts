import { describe, expect, test } from "vitest";

import { formatCount, formatDate, formatDistance } from "@/lib/format";

describe("formatDistance", () => {
  test("1km 未満は 10m 単位の m 表示", () => {
    expect(formatDistance(456)).toBe("460m");
    expect(formatDistance(289)).toBe("290m");
  });

  test("1km 以上 10km 未満は小数1桁の km", () => {
    expect(formatDistance(1234)).toBe("1.2km");
    expect(formatDistance(9950)).toBe("9.9km");
  });

  test("10km 以上は整数の km", () => {
    expect(formatDistance(12_345)).toBe("12km");
    expect(formatDistance(256_000)).toBe("256km");
  });

  /*
    **境目の決めごとを、ここで固定しておく。**
    999m は「1000m」と出る（10m 単位に丸めたあとで km に切り替わらないため）。
    元データの座標には小数2桁（約1km 精度）の行が10件あるので、この辺りの
    桁を作り込む意味は薄いと判断してこのままにしている。変えるならここを直す。
  */
  test("端の振る舞い", () => {
    expect(formatDistance(0)).toBe("0m");
    expect(formatDistance(4)).toBe("0m");
    expect(formatDistance(999)).toBe("1000m");
    expect(formatDistance(1000)).toBe("1.0km");
  });
});

describe("formatDate", () => {
  /*
    **UTC で読むこと。** 元データの日付列は Date 型（時刻を持たない）で、
    Prisma からは UTC の 0 時として返る。ローカル時刻で組み立てると日付がずれる。
    このテストは TZ=Asia/Tokyo で走る（vitest.config.ts）ので、
    ローカル時刻で書き直すと下の2つ目が 9月14日 になって落ちる。
  */
  test("UTC の 0 時は、その日付として出る", () => {
    expect(formatDate(new Date(Date.UTC(2026, 8, 13)))).toBe("2026年9月13日");
  });

  test("ローカル時刻で読むと日付が変わる時刻でも、UTC のまま読む", () => {
    // JST では 2026-09-14 08:00。ローカルで組み立てると 9月14日 になる。
    expect(formatDate(new Date("2026-09-13T23:00:00Z"))).toBe("2026年9月13日");
  });

  test("年をまたぐ境目", () => {
    expect(formatDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026年1月1日");
    expect(formatDate(new Date("2025-12-31T00:00:00Z"))).toBe("2025年12月31日");
  });
});

describe("formatCount", () => {
  test("桁区切りを ja-JP で固定する（実行環境の既定に振り回されない）", () => {
    expect(formatCount(199_116)).toBe("199,116");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });
});
