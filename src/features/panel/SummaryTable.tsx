"use client";

import { useState } from "react";

import { api } from "@/client/api";
import { useResource } from "@/client/use-resource";
import { InlineDetail } from "@/features/panel/DetailPane";
import { Message, MissingDot } from "@/features/panel/parts";
import { filterBadges, type ShelterFilter } from "@/lib/filter";
import { formatDistance } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import { kindOf } from "@/lib/kinds";
import type { Origin } from "@/lib/origin";
import type { PlaceSummary } from "@/lib/shelter";
import {
  groupSummaryRows,
  groupTitle,
  isFar,
  NEARBY_LIMIT_M,
  type SummaryGroup,
} from "@/lib/summary";

/**
 * 「8種の災害 × それぞれの最寄り」の表。
 *
 * このアプリの主張1（避難場所は災害の種類ごとに分かれている）を、
 * **1つの拠点について一度に**見せる。地図で1件ずつ確かめるのと違い、
 * ここだけが持ち帰れる形になる（.local/PLAN.md 壁4）。
 * 絞り込みは効かせない。8種すべてが並ぶこと自体が答えなので。
 */
export default function SummaryTable({
  origin,
  filter,
  onFocus,
}: {
  origin: Origin;
  /** 表には効かないが、効いていないことを言う必要があるかの判断に使う */
  filter: ShelterFilter;
  onFocus: (target: LatLng) => void;
}) {
  const { data: summary, error } = useResource<PlaceSummary>(
    api.summary(origin),
  );
  /*
    開いた行はその場で広げる。詳細を別の画面にすると、
    「押す → 戻る → 次を押す」の往復になって、見比べるほど手間が増える。
  */
  const [openId, setOpenId] = useState<string | null>(null);

  if (error) return <Message>{error}</Message>;
  if (!summary) return <Message>調べています…</Message>;

  const groups = groupSummaryRows(summary.rows);
  /** 「近くにありません」を1行でも出したか。出したときだけ、その意味を断る。 */
  const explained = groups.some((group) => group.far || !group.item);

  return (
    <>
      {/*
        絞り込みバーはこの表の上にあるが、表はそれを見ない（8種すべてが並ぶこと
        自体が答えなので）。押しても表が動かない理由を、押す人の目の高さで言う。

        **ただし、絞り込んでいるときだけ言う。** 既定は絞り込みなしなので、
        常設すると**誰も食い違っていない場面で、全員がこの2行を読まされる**。
        既定の初回表示でいちばん見てほしいのは下の表のほうで、その上に
        断り書きを置く理由はない。食い違いが起きた人にだけ、その場で言う。
      */}
      {filterBadges(filter).length > 0 && (
        <p className="border-b border-zinc-100 px-3 py-1.5 text-[11px] leading-relaxed text-zinc-500">
          絞り込んでいても、この表は8種すべてを出します
          （絞り込みは地図と「近い順」に効きます）。
        </p>
      )}
      {/*
        **8行ではなく、行き先の数だけ並ぶ。** 同じ施設に落ちた災害は1行に束ねる
        （src/lib/summary.ts）。上から近い順なので、読み始めた行がそのまま答えになり、
        「近くにありません」は下にまとまる。
      */}
      <ul className="divide-y divide-zinc-100">
        {groups.map((group) => (
          <li key={group.item?.id ?? "missing"}>
            <SummaryGroupView
              title={groupTitle(group)}
              group={group}
              open={Boolean(group.item) && group.item?.id === openId}
              onToggle={setOpenId}
              onFocus={onFocus}
            />
          </li>
        ))}
      </ul>

      {/*
        指定避難所は災害種別を持たないので、8種の表に混ぜない。
        混ぜると「この災害で使える避難所」と読まれる。
      */}
      <div className="border-t-4 border-zinc-100">
        <p className="px-3 pt-2 text-[11px] text-zinc-500">
          災害がおさまったあと、生活する場所（{kindOf("SHELTER").label}）
        </p>
        <SummaryGroupView
          // 上の1行が名乗っているので、行の見出しは要らない。
          title={null}
          group={{
            disasters: [],
            item: summary.shelter,
            far: summary.shelter ? isFar(summary.shelter) : false,
          }}
          open={Boolean(summary.shelter) && summary.shelter?.id === openId}
          onToggle={setOpenId}
          onFocus={onFocus}
        />
      </div>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        半径{Math.round(summary.radiusM / 1000)}km まで探しました。
        距離は直線距離で、実際の道のりではありません。
        {explained &&
          `「近くにありません」は、${NEARBY_LIMIT_M / 1000}km 以内に、その災害で使える指定が無いという意味です。`}
      </p>
    </>
  );
}

/**
 * 表の1行。**「見つかった／見つからない」ではなく「逃げ先になる／ならない」で分ける。**
 *
 * 半径のはしごは 256km まで伸びるので、その災害の指定が自分の市町村に無いと、
 * 遠くの市町村の指定が最寄りとして返ってくる。それを 500m の小学校と同じ書式で並べると、
 * 表が答えの顔をしたまま嘘をつく。遠いものは名前を主役から降ろし、
 * 「近くにありません」と言い切ったうえで、どこにあるかだけ添える（src/lib/summary.ts）。
 */
function SummaryGroupView({
  title,
  group,
  open,
  onToggle,
  onFocus,
}: {
  /** 行の見出し。指定避難所の行のように、上の見出しで足りるときは null */
  title: string | null;
  group: SummaryGroup;
  open: boolean;
  onToggle: (id: string | null) => void;
  onFocus: (target: LatLng) => void;
}) {
  const { item, far } = group;
  const heading = title && (
    <span className="block text-xs font-semibold text-zinc-900">{title}</span>
  );

  // 押す先が無いので、ボタンにしない。
  if (!item) {
    return (
      <div className="px-3 py-2.5">
        {heading}
        <p className={`flex items-center gap-1.5 ${title ? "mt-1" : ""}`}>
          <MissingDot />
          <span className="text-sm font-semibold text-zinc-900">
            近くにありません
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
          探した範囲に、その災害で使える指定がありませんでした。
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          onFocus(item);
          onToggle(open ? null : item.id);
        }}
        className={`block w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${
          open ? "bg-zinc-50" : ""
        }`}
      >
        {heading}
        <span className={`flex items-center gap-1.5 ${title ? "mt-1" : ""}`}>
          {far ? (
            <MissingDot />
          ) : (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: kindOf(item.kind).color }}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
            {far ? "近くにありません" : item.name}
          </span>
          {/* 遠い行の距離は答えの顔をさせない。下の1行に回す。 */}
          {!far && (
            <span className="shrink-0 text-xs font-semibold text-zinc-900 tabular-nums">
              {formatDistance(item.distanceM)}
            </span>
          )}
        </span>
        <span
          className={`mt-0.5 block truncate text-xs ${
            far ? "text-zinc-600" : "text-zinc-500"
          }`}
        >
          {far
            ? `最寄りは${formatDistance(item.distanceM)}先の${item.name}`
            : item.address}
        </span>
      </button>
      {open && <InlineDetail id={item.id} />}
    </>
  );
}
