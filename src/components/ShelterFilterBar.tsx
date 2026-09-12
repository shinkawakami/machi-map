"use client";

import type { ShelterKind } from "@/generated/prisma/enums";
import { DISASTER_TYPES, type DisasterKey } from "@/lib/disasters";
import { KINDS } from "@/lib/kinds";
import type { ShelterFilter } from "@/lib/shelters";

/**
 * 絞り込みの操作列。地図の上に重ねず、ヘッダの下に置いて場所を分けている。
 *
 * スマホでは地図に重ねたものが指で隠れるうえ、下端はフッタの出典表示と
 * 属性表示（消せない）で埋まっている。行を1本立てるほうが、幅が変わっても崩れない。
 * 災害種別はチップの横スクロールにして、8種を折り返さずに収める。
 */
export default function ShelterFilterBar({
  value,
  onChange,
}: {
  value: ShelterFilter;
  onChange: (next: ShelterFilter) => void;
}) {
  const toggleKind = (kind: ShelterKind) => {
    const next = value.kinds.includes(kind)
      ? value.kinds.filter((k) => k !== kind)
      : [...value.kinds, kind];
    // 両方消すと空の地図になる。最後の1つは外させない。
    if (next.length === 0) return;
    onChange({ ...value, kinds: next });
  };

  const selectDisaster = (disaster: DisasterKey | null) => {
    onChange({ ...value, disaster });
  };

  const shelterVisible = value.kinds.includes("SHELTER");

  return (
    <div className="shrink-0 border-b border-zinc-200 bg-white">
      <div className="flex items-center gap-1.5 px-3 pt-2">
        {KINDS.map((kind) => {
          const on = value.kinds.includes(kind.key);
          const last = on && value.kinds.length === 1;
          return (
            <button
              key={kind.key}
              type="button"
              aria-pressed={on}
              aria-disabled={last}
              title={last ? "どちらかは表示します" : kind.description}
              onClick={() => toggleKind(kind.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-zinc-300 bg-zinc-100 font-medium text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-400"
              }`}
            >
              <span
                className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: on ? kind.color : "#d4d4d8" }}
              />
              {kind.shortLabel}
            </button>
          );
        })}

        {/*
          2つの違いの説明。常に開いておくと地図の高さを食い、たたむと読まれない。
          既定は閉じておき、Week 4 のトップの説明で本文として別に置く。
        */}
        <details className="group relative ml-auto">
          <summary className="cursor-pointer list-none rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 marker:content-none">
            違い
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed shadow-lg">
            <dl className="flex flex-col gap-2">
              {KINDS.map((kind) => (
                <div key={kind.key}>
                  <dt className="flex items-center gap-1.5 font-semibold text-zinc-900">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: kind.color }}
                    />
                    {kind.label}
                  </dt>
                  <dd className="mt-0.5 pl-4 text-zinc-600">
                    {kind.description}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 border-t border-zinc-100 pt-2 text-zinc-500">
              同じ建物が両方に指定されていることもあれば、片方だけのこともあります。
            </p>
          </div>
        </details>
      </div>

      {/*
        災害種別は単一選択。「今この災害が起きたらどこへ逃げるか」という問いに
        対応させたいので、複数の災害で使える場所を探す掛け合わせにはしない。
      */}
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2">
        <DisasterChip
          selected={value.disaster === null}
          onClick={() => selectDisaster(null)}
        >
          すべて
        </DisasterChip>
        {DISASTER_TYPES.map((disaster) => (
          <DisasterChip
            key={disaster.key}
            selected={value.disaster === disaster.key}
            title={disaster.sourceLabel}
            onClick={() => selectDisaster(disaster.key)}
          >
            {disaster.label}
          </DisasterChip>
        ))}
      </div>

      {/*
        指定避難所に災害種別の指定は存在しない。黙って全部残すと
        「洪水で使える避難所」だと読まれてしまうので、そのときだけ断る。
      */}
      {value.disaster && shelterVisible && (
        <p className="border-t border-zinc-100 px-3 py-1.5 text-[11px] leading-snug text-zinc-500">
          指定避難所には災害種別の指定がないため、絞り込みの対象外です（
          <span className="text-zinc-700">
            {KINDS[1].shortLabel}
          </span>
          を外すと隠せます）
        </p>
      )}
    </div>
  );
}

function DisasterChip({
  selected,
  title,
  onClick,
  children,
}: {
  selected: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors ${
        selected
          ? "border-zinc-900 bg-zinc-900 font-medium text-white"
          : "border-zinc-200 bg-white text-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}
