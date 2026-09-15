"use client";

import { useEffect, useState } from "react";

import { BASEMAPS, type BasemapKey, basemapOf } from "@/features/map/map-style";

/**
 * 背景地図の切り替え。**地図の操作系として、ズームと現在地の下に並べる。**
 *
 * 「操作はパネルに集める」（MapChips）の例外にあたるが、ズームや現在地と同じで
 * **これは地図そのものの見え方を変えるもの**で、避難場所の絞り込み（＝答えの中身を
 * 変えるもの）とは別の仕事をしている。パネルの中に入れると、地図を見ながら
 * 見比べる操作に、シートを開く手間が毎回挟まる。
 *
 * **畳んでおく。** 右上に常設できるのは1つぶんの高さで、そこは現在地が使っている。
 * 3種を並べると 150px ほどの帯が地図に居座り、凡例（左上）と合わせて
 * 上端が塞がる。押したときだけ開く。
 *
 * 畳み方は絞り込み（ShelterFilterBar）と同じ `<details>`＋外を押すか Esc で閉じる。
 * **ただしこちらは選んだ時点で閉じる。** 択一なので押し直す用事が無く、
 * 開いたままだと切り替えた地図が自分のパネルで隠れる（絞り込みは複数選ぶので開けたまま）。
 *
 * **閉じるための外の一押しは、地図に届かせない。** 絞り込みと違って外側が地図なので、
 * document で拾って閉じるだけだと、**同じ一押しで起点が動く**
 * （地図の click は押した場所を起点にする。interactions.ts）。
 * メニューを閉じただけのつもりでピンが飛ぶことになるので、開いているあいだは
 * 透明な受け皿を敷いて、そこで止める。
 */
export default function BasemapControl({
  value,
  onChange,
}: {
  value: BasemapKey;
  onChange: (next: BasemapKey) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const current = basemapOf(value);

  return (
    <>
      {/*
        外を押したら閉じるための受け皿。**地図にも現在地ボタンにも届かせない**ので、
        z は同じ 10 に置いて（DOM 上はどちらより後ろ）、この部品だけを 20 で上に出す。
        Modal（30）の下。
      */}
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-10"
          onPointerDown={() => setOpen(false)}
        />
      )}

      {/*
        現在地ボタン（top-[76px]・高さ 40px）の真下。8px 空けて 124px から。
        右端の余白は 10px でズーム・現在地とそろえる。
      */}
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="absolute top-[124px] right-2.5 z-20"
      >
        {/*
          **記号だけにしない。** 現在地ボタンと同じ理由（タッチ端末では title が
          出ないので、記号を知らない人には手がかりが残らない）。
          いま何で見ているかも、ここにしか出ない。
        */}
        <summary
          aria-label={`背景地図を選ぶ（いまは${current.label}）`}
          className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm transition-colors marker:content-none hover:bg-zinc-50"
        >
          <LayersIcon />
          {current.label}
        </summary>

        {/*
          下に開く。**この列は上端から 164px の位置にいて、下は地図しかない**ので、
          絞り込み（下のシートに居るので上へ開く）とは事情が違う。
        */}
        <div className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
          <p className="px-2 pt-1 pb-0.5 text-xs font-medium text-zinc-500">
            背景地図
          </p>
          {BASEMAPS.map((basemap) => {
            const on = basemap.key === value;
            return (
              <button
                key={basemap.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onChange(basemap.key);
                  setOpen(false);
                }}
                className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  on ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] ${
                      on ? "font-medium text-zinc-900" : "text-zinc-700"
                    }`}
                  >
                    {basemap.label}
                  </span>
                  {/* 名前だけでは選べない。違いを1行で添える（map-style.ts の note）。 */}
                  <span className="block text-xs text-zinc-500">
                    {basemap.note}
                  </span>
                </span>
                {on && <CheckIcon />}
              </button>
            );
          })}
          {/*
            **写真を選べるようにした以上、断っておく。** 撮影時期はタイルごとに
            違い、新しい造成や建て替えは写っていないことがある。
            避難場所の点（市町村の登録）とは別の出どころなので、
            写真に写っていない＝無い、とは読めない。
          */}
          <p className="px-2 pt-1 pb-1 text-xs leading-snug text-zinc-500">
            写真は撮影時期が場所ごとに異なります。避難場所の点とは別のデータです。
          </p>
        </div>
      </details>
    </>
  );
}

/** 重ねた紙。地図アプリで背景の切り替えに使われている記号。 */
function LayersIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 14 9 5 9-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#18181b"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="m5 12.5 5 5 9-11" />
    </svg>
  );
}
