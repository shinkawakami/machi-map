"use client";

import { useEffect, useRef, useState } from "react";

import type { ShelterKind } from "@/generated/prisma/enums";
import { DISASTER_TYPES } from "@/lib/disasters";
import { KINDS } from "@/lib/kinds";
import type { ShelterFilter } from "@/lib/shelters";

/**
 * 絞り込み。**1行に畳んでパネルの中に置く。**
 *
 * 以前は地図の上に常設していて、種別・災害8種・注記で縦を 90px ほど使っていた。
 * ところが拠点ごとの「8種 × 最寄り」の表が8種を一度に出すようになり、
 * 地図を絞る場面自体が減った。常時その幅を取る理由がない。
 *
 * 災害種別は単一選択。「今この災害が起きたらどこへ逃げるか」という問いに
 * 対応させたいので、複数の災害で使える場所を探す掛け合わせにはしない。
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
    if (next.length === 0) {
      setHint((n) => n + 1);
      return;
    }
    onChange({ ...value, kinds: next });
  };

  const selected = DISASTER_TYPES.find((d) => d.key === value.disaster);
  const shelterVisible = value.kinds.includes("SHELTER");

  /*
    最後の1つを押した人に返す一言。理由は title に書いてあったが、
    **タッチ端末では title が出ない**ので、押しても何も起きない操作になっていた
    （地図右上の現在地ボタンで同じことに気づいて文字を添えたのと、同じ話）。
    押した回数を持つのは、続けて押されたときに出しっぱなしの時計を引き直すため。
  */
  const [hint, setHint] = useState(0);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(0), 2500);
    return () => clearTimeout(timer);
  }, [hint]);

  /*
    開いたら、外を押すか Esc で閉じる。<details> は summary を押し直すまで
    開いたままなので、地図を触りに行ったのに絞り込みが残る。
  */
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="shrink-0 border-b border-zinc-100">
      <div className="flex items-center gap-1.5 px-3 py-1.5">
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
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                on
                  ? "border-zinc-300 bg-zinc-100 font-medium text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-500"
              }`}
            >
              <span
                className="size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: on ? kind.color : "#d4d4d8" }}
              />
              {kind.shortLabel}
            </button>
          );
        })}

        {/*
          災害種別は畳んでおく。開くのは絞りたいときだけで、
          普段は「いま何で絞っているか」が読めれば足りる。
        */}
        <details
          ref={detailsRef}
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
          className="group relative ml-auto"
        >
          <summary
            className={`cursor-pointer list-none rounded-full border px-2.5 py-1 text-[11px] marker:content-none ${
              selected
                ? "border-zinc-900 bg-zinc-900 font-medium text-white"
                : "border-zinc-200 text-zinc-500"
            }`}
          >
            {selected ? selected.label : "災害で絞る"} ▾
          </summary>

          <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
            <div className="flex flex-wrap gap-1">
              <DisasterChip
                selected={value.disaster === null}
                onClick={() => {
                  onChange({ ...value, disaster: null });
                  setOpen(false);
                }}
              >
                すべて
              </DisasterChip>
              {DISASTER_TYPES.map((disaster) => (
                <DisasterChip
                  key={disaster.key}
                  selected={value.disaster === disaster.key}
                  title={disaster.sourceLabel}
                  onClick={() => {
                    onChange({ ...value, disaster: disaster.key });
                    setOpen(false);
                  }}
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
              <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] leading-snug text-zinc-500">
                {KINDS[1].label}には災害種別の指定がないため、絞り込みの対象外です
              </p>
            )}
          </div>
        </details>
      </div>

      {hint > 0 && (
        <p role="status" className="px-3 pb-1.5 text-[11px] text-zinc-600">
          {KINDS.map((k) => k.shortLabel).join("・")}
          のどちらかは地図に出します。
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
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors ${
        selected
          ? "border-zinc-900 bg-zinc-900 font-medium text-white"
          : "border-zinc-200 bg-white text-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}
