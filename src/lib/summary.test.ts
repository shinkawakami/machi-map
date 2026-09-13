import { describe, expect, test } from "vitest";

import { DISASTER_TYPES, type DisasterKey } from "@/lib/disasters";
import type { NearbyItem, SummaryRow } from "@/lib/shelter";
import {
  groupSummaryRows,
  groupTitle,
  isFar,
  NEARBY_LIMIT_M,
} from "@/lib/summary";

/**
 * **このアプリがいちばん見せたい差を作っている関数。**
 *
 * サーバーは8種ぶんを素直に8行で返すが、3人に1人は8行とも同じ施設になる。
 * そのまま出すと「災害の種類ごとに使える・使えないが分かれる」という主張が、
 * それを言うための画面で消える。束ね方が崩れても画面は正常に見えるので、
 * ここもテストでしか気づけない。
 */

function item(id: string, distanceM: number): NearbyItem {
  return {
    id,
    kind: "EMERGENCY",
    name: `${id}小学校`,
    address: "東京都千代田区",
    lat: 35.68,
    lng: 139.76,
    disasters: ["flood"],
    sameAddressAsOther: false,
    targetPersons: null,
    otherMatters: null,
    note: null,
    distanceM,
  };
}

function rows(
  entries: [DisasterKey, NearbyItem | null][],
): SummaryRow[] {
  return entries.map(([disaster, nearest]) => ({ disaster, nearest }));
}

/** 8種すべてが同じ施設に落ちた表（実データで 35.7% がこれ）。 */
function allSame(target: NearbyItem): SummaryRow[] {
  return DISASTER_TYPES.map((d) => ({ disaster: d.key, nearest: target }));
}

describe("groupSummaryRows", () => {
  test("**同じ施設に落ちた災害は1行に束ねる**", () => {
    const school = item("a", 500);
    const groups = groupSummaryRows(allSame(school));

    expect(groups).toHaveLength(1);
    expect(groups[0].disasters).toHaveLength(8);
    expect(groups[0].item?.id).toBe("a");
  });

  test("行き先が違えば分かれる", () => {
    const groups = groupSummaryRows(
      rows([
        ["flood", item("a", 500)],
        ["landslide", item("b", 800)],
        ["stormSurge", item("a", 500)],
      ]),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].disasters).toEqual(["flood", "stormSurge"]);
    expect(groups[1].disasters).toEqual(["landslide"]);
  });

  test("**近い順に並ぶ**（上から読めば、そのまま答えになる）", () => {
    const groups = groupSummaryRows(
      rows([
        ["flood", item("far", 2000)],
        ["landslide", item("near", 300)],
        ["stormSurge", item("mid", 900)],
      ]),
    );
    expect(groups.map((g) => g.item?.id)).toEqual(["near", "mid", "far"]);
  });

  test("束ねた中の災害は、渡された並びをそのまま保つ", () => {
    /*
      サーバーは DISASTER_TYPES（＝国土地理院 CSV の列順）で返すので、
      並びを保つことがそのまま「画面も CSV の列順で出る」になる。
      本番と同じ形で渡して確かめる。
    */
    const school = item("a", 500);
    const groups = groupSummaryRows(
      rows([
        ["flood", school],
        ["earthquake", school],
        ["tsunami", school],
      ]),
    );
    expect(groups[0].disasters).toEqual(["flood", "earthquake", "tsunami"]);
    // DISASTER_TYPES に現れる順と一致していること
    const order = DISASTER_TYPES.map((d) => d.key);
    const indexes = groups[0].disasters.map((k) => order.indexOf(k));
    expect(indexes).toEqual([...indexes].sort((x, y) => x - y));
  });

  test("見つからなかったものは1行にまとめる（施設が無いので分ける意味がない）", () => {
    const groups = groupSummaryRows(
      rows([
        ["flood", item("a", 500)],
        ["landslide", null],
        ["volcano", null],
      ]),
    );
    const missing = groups.filter((g) => !g.item);
    expect(missing).toHaveLength(1);
    expect(missing[0].disasters).toEqual(["landslide", "volcano"]);
  });

  test("**「近くにありません」は必ず下にまとまる**", () => {
    const groups = groupSummaryRows(
      rows([
        ["flood", null],
        ["landslide", item("a", 500)],
      ]),
    );
    expect(groups.at(-1)?.item).toBeNull();
  });

  test("8種すべてが見つからなくても落ちない", () => {
    const groups = groupSummaryRows(
      DISASTER_TYPES.map((d) => ({ disaster: d.key, nearest: null })),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].disasters).toHaveLength(8);
  });

  test("空でも落ちない", () => {
    expect(groupSummaryRows([])).toEqual([]);
  });
});

describe("isFar", () => {
  /*
    半径のはしごは 256km まで伸びる。その災害の指定が自分の市町村に無いと、
    遠くの市町村の指定が最寄りとして返る。**500m の小学校と 12km 先の公園を
    同じ書式で並べると、表が答えの顔をしたまま嘘をつく。**
  */
  test(`${NEARBY_LIMIT_M / 1000}km を境に「逃げ先になる/ならない」で分ける`, () => {
    expect(isFar(item("a", NEARBY_LIMIT_M - 1))).toBe(false);
    expect(isFar(item("a", NEARBY_LIMIT_M))).toBe(false);
    expect(isFar(item("a", NEARBY_LIMIT_M + 1))).toBe(true);
  });

  test("束ねた行にも遠さが伝わる", () => {
    const groups = groupSummaryRows(
      rows([
        ["flood", item("near", 500)],
        ["landslide", item("far", 12_000)],
      ]),
    );
    expect(groups.find((g) => g.item?.id === "near")?.far).toBe(false);
    expect(groups.find((g) => g.item?.id === "far")?.far).toBe(true);
  });
});

describe("groupTitle", () => {
  test("**8種すべてが1つに落ちたら、並べずにそう言う**", () => {
    const groups = groupSummaryRows(allSame(item("a", 500)));
    expect(groupTitle(groups[0])).toBe("8種すべての災害");
  });

  test("一部なら名前を並べる", () => {
    const groups = groupSummaryRows(
      rows([
        ["flood", item("a", 500)],
        ["earthquake", item("a", 500)],
      ]),
    );
    expect(groupTitle(groups[0])).toBe("洪水・地震");
  });
});
