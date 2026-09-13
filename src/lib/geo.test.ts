import { describe, expect, test } from "vitest";

import {
  type Bbox,
  bboxAround,
  cellSizeDeg,
  clamp,
  roundCoord,
  snapBbox,
  snapCells,
} from "@/lib/geo";

/**
 * ここが壊れても画面は正常に動く。**壊れるのは本番の速さのほう**で、
 * 同じ問い合わせが別の URL に散って CDN に当たらなくなる。
 * 見て気づける類のものではないので、テストで押さえる。
 */

const TOKYO: Bbox = { west: 139.7, south: 35.65, east: 139.8, north: 35.72 };

describe("snapBbox", () => {
  test("**外側へ**丸める。内側に丸めると画面の縁の避難場所が消える", () => {
    const snapped = snapBbox(TOKYO);
    expect(snapped.west).toBeLessThanOrEqual(TOKYO.west);
    expect(snapped.east).toBeGreaterThanOrEqual(TOKYO.east);
    expect(snapped.south).toBeLessThanOrEqual(TOKYO.south);
    expect(snapped.north).toBeGreaterThanOrEqual(TOKYO.north);
  });

  test("**パンしても URL の数は増えない**（これが吸着の目的そのもの）", () => {
    /*
      幅1つぶん東へ、200 回に分けて動かす。**200 通りのビューポートが、
      数えるほどの矩形にしか落ちない**のが吸着の目的。

      格子8つぶんをまたぐので素朴には8通りに見えるが、west と east は
      別々に境界をまたぐため、その組み合わせで倍前後（実測 19）になる。
      それでも 200 → 19 で、CDN に当たる回数が一桁変わる。
    */
    const width = TOKYO.east - TOKYO.west;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const d = (width * i) / 200;
      seen.add(
        JSON.stringify(
          snapBbox({ ...TOKYO, west: TOKYO.west + d, east: TOKYO.east + d }),
        ),
      );
    }
    expect(seen.size).toBeLessThanOrEqual(24);
  });

  test("**1px パンしても同じ矩形に落ちる**（これが効きの本体）", () => {
    const panned = snapBbox({
      west: TOKYO.west + 0.0001,
      south: TOKYO.south + 0.0001,
      east: TOKYO.east + 0.0001,
      north: TOKYO.north + 0.0001,
    });
    expect(panned).toEqual(snapBbox(TOKYO));
  });

  test("広がりすぎない（片側で幅の 25% 未満に収まる）", () => {
    const width = TOKYO.east - TOKYO.west;
    const snapped = snapBbox(TOKYO);
    expect(TOKYO.west - snapped.west).toBeLessThan(width * 0.25);
    expect(snapped.east - TOKYO.east).toBeLessThan(width * 0.25);
  });

  test("世界の端を越えない", () => {
    const world = snapBbox({ west: -180, south: -90, east: 180, north: 90 });
    expect(world.west).toBeGreaterThanOrEqual(-180);
    expect(world.east).toBeLessThanOrEqual(180);
    expect(world.south).toBeGreaterThanOrEqual(-90);
    expect(world.north).toBeLessThanOrEqual(90);
  });
});

describe("snapCells", () => {
  test("2の冪に寄せる（画面幅の種類だけ URL が分かれるのを防ぐ）", () => {
    expect(snapCells(13)).toBe(16);
    expect(snapCells(20)).toBe(16);
    expect(snapCells(4)).toBe(4);
    expect(snapCells(32)).toBe(32);
  });

  test("4〜32 の4通りにしかならない", () => {
    const seen = new Set<number>();
    for (let n = -100; n <= 200; n += 0.5) seen.add(snapCells(n));
    expect([...seen].sort((a, b) => a - b)).toEqual([4, 8, 16, 32]);
  });

  test("数でない値は既定に落とす（手で組んだ URL でも地図を出す）", () => {
    expect(snapCells(Number.NaN)).toBe(16);
    expect(snapCells(Number.POSITIVE_INFINITY)).toBe(16);
  });
});

describe("roundCoord", () => {
  test("小数4桁 ≒ 11m に丸める", () => {
    expect(roundCoord(35.681236)).toBe(35.6812);
    expect(roundCoord(139.76712345)).toBe(139.7671);
  });

  test("**現在地のわずかな揺れが同じ URL に落ちる**", () => {
    expect(roundCoord(35.68120)).toBe(roundCoord(35.681204));
  });

  test("冪等（2回通しても変わらない）", () => {
    const once = roundCoord(35.681236);
    expect(roundCoord(once)).toBe(once);
  });

  test("負の値でも桁が増えない", () => {
    expect(roundCoord(-35.681236)).toBe(-35.6812);
  });
});

describe("bboxAround", () => {
  const center = { lat: 35.6812, lng: 139.7671 };

  test("半径ぶんの四方を必ず含む（角を取りこぼさない）", () => {
    const radiusM = 2000;
    const box = bboxAround(center, radiusM);
    const dLat = radiusM / 111_320;
    expect(box.south).toBeLessThanOrEqual(center.lat - dLat);
    expect(box.north).toBeGreaterThanOrEqual(center.lat + dLat);
  });

  test("経度の幅は緯度が上がるほど広がる（メルカトルの補正）", () => {
    const tokyo = bboxAround(center, 10_000);
    const sapporo = bboxAround({ lat: 43.06, lng: 141.35 }, 10_000);
    expect(sapporo.east - sapporo.west).toBeGreaterThan(tokyo.east - tokyo.west);
  });

  test("補正は中心ではなく**端**の緯度で取る（中心だと角がはみ出す）", () => {
    // 中心の緯度で割った幅より、必ず広いこと。
    const radiusM = 100_000;
    const box = bboxAround(center, radiusM);
    const naive = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
    expect(box.east - center.lng).toBeGreaterThan(naive);
  });

  test("半径が大きくなるほど広がる", () => {
    const small = bboxAround(center, 2000);
    const large = bboxAround(center, 256_000);
    expect(large.north).toBeGreaterThan(small.north);
    expect(large.west).toBeLessThan(small.west);
  });
});

describe("cellSizeDeg", () => {
  test("分割数を増やすとセルは小さくなる", () => {
    expect(cellSizeDeg(TOKYO, 32)).toBeLessThan(cellSizeDeg(TOKYO, 4));
  });

  test("2の冪のはしごに乗る（360 / 2^k）", () => {
    const k = Math.log2(360 / cellSizeDeg(TOKYO, 16));
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
  });
});

describe("clamp", () => {
  test("範囲に収める", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
