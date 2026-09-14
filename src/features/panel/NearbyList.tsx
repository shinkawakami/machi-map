"use client";

import { useState } from "react";

import { api } from "@/client/api";
import { useResource } from "@/client/use-resource";
import { InlineDetail } from "@/features/panel/DetailPane";
import { Message } from "@/features/panel/parts";
import { disasterLabel } from "@/lib/disasters";
import type { ShelterFilter } from "@/lib/filter";
import { formatDistance } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import { kindOf } from "@/lib/kinds";
import type { Origin } from "@/lib/origin";
import type { NearbyResult } from "@/lib/shelter";

/**
 * 近い順の一覧。災害別の表（SummaryTable）の裏取りにあたる面。
 *
 * 絞り込みは効く。「この災害で使える最寄り」が変わるのが要点なので、
 * 一覧を開いたまま災害種別を切り替えられるようにしてある
 * （URL が変われば useResource が取り直して「探しています…」に戻る）。
 */
export default function NearbyList({
  origin,
  filter,
  onFocus,
}: {
  origin: Origin;
  filter: ShelterFilter;
  onFocus: (target: LatLng) => void;
}) {
  const { data: result, error } = useResource<NearbyResult>(
    api.nearby(origin, filter),
  );
  // 表と同じく、開いた行はその場で広げる。
  const [openId, setOpenId] = useState<string | null>(null);

  if (error) return <Message>{error}</Message>;
  if (!result) return <Message>探しています…</Message>;
  if (result.items.length === 0) {
    return (
      <Message>
        半径{Math.round(result.radiusM / 1000)}km 以内に、条件に合う場所が
        見つかりませんでした。
      </Message>
    );
  }

  return (
    <>
      <ul className="divide-y divide-zinc-100">
        {result.items.map((item) => (
          <li key={item.id}>
            {/*
              **災害別の表と同じ組みにする。** 以前はここだけ距離が左端にあり、
              タブを行き来するたびに同じ数字を逆の端で探すことになっていた。
              近い順は距離を縦に読む一覧なので左端にも理はあるが、
              2つの面を往復する作りである以上、そろっているほうが効く。
            */}
            <button
              type="button"
              aria-expanded={item.id === openId}
              onClick={() => {
                onFocus(item);
                setOpenId(item.id === openId ? null : item.id);
              }}
              className={`block w-full px-4 py-3 text-left hover:bg-zinc-50 ${
                item.id === openId ? "bg-zinc-50" : ""
              }`}
            >
              <span className="flex items-center gap-1.5">
                {/*
                  同じ場所に両方の指定があるときは、地図の二色の点と同じ見た目
                  （橙の芯＋青いリング）にする。色は増やさない。
                */}
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: kindOf(item.kind).color,
                    boxShadow: item.alsoKind
                      ? `0 0 0 2px ${kindOf(item.alsoKind).color}`
                      : undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-900">
                  {item.name}
                </span>
                {/*
                  記号だけにしない。二色の点は凡例を知らないと読めないので、
                  もう一方の指定があることは文字でも書く。
                */}
                {item.alsoKind && (
                  <span className="shrink-0 rounded-full border border-zinc-300 px-2 text-xs text-zinc-600">
                    {kindOf(item.alsoKind).shortLabel}も
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold text-zinc-900 tabular-nums">
                  {formatDistance(item.distanceM)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-zinc-500">
                {item.disasters === null
                  ? "災害種別の指定なし"
                  : item.disasters.map((d) => disasterLabel(d)).join("・")}
              </span>
            </button>
            {item.id === openId && <InlineDetail id={item.id} />}
          </li>
        ))}
      </ul>
      <p className="px-4 py-2.5 text-xs leading-relaxed text-zinc-500">
        半径{Math.round(result.radiusM / 1000)}km まで探しました
        {result.exhausted && "（これ以上は見つかりませんでした）"}。
        距離は直線距離で、実際の道のりではありません。
      </p>
    </>
  );
}
