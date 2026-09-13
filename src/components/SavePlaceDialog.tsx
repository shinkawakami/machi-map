"use client";

import { useState } from "react";

import Modal from "@/components/Modal";
import { PLACE_PRESETS, sanitizePlaceName } from "@/lib/places";

/**
 * 起点を拠点として保存するときの名前を決める。
 *
 * プリセットを先に置き、自由入力は下に小さく置く。
 * この URL は家族に送られる前提なので、既定の操作で建物名や部屋番号が
 * 入らないようにしておきたい（.local/PLAN.md「プライバシー」の節）。
 */
export default function SavePlaceDialog({
  usedNames,
  onSave,
  onCancel,
}: {
  /** すでに使っている名前。押せなくはしないが、上書きになることを見せる */
  usedNames: string[];
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState("");
  const cleaned = sanitizePlaceName(custom);

  return (
    <Modal label="この場所を拠点として保存します" onClose={onCancel}>
      <p className="text-sm font-semibold text-zinc-900">
        この場所を拠点として保存します
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        保存した拠点は URL に入ります。次に開くときも、家族に送るときも、
        この URL が正本です。
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PLACE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onSave(preset)}
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 transition-colors hover:bg-zinc-50"
          >
            {preset}
            {usedNames.includes(preset) && (
              <span className="ml-1 text-[10px] text-zinc-500">上書き</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="ほかの名前"
          maxLength={12}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-500"
        />
        <button
          type="button"
          disabled={!cleaned}
          onClick={() => onSave(cleaned)}
          className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          保存
        </button>
      </div>
      {/*
        これは注意書きではなく、URL が家族に渡ることの帰結そのもの。
        いちばん薄い色（zinc-400・白地で 2.6:1）で置いていたのを、読める濃さに上げる。
      */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
        部屋番号や建物名は入れないでください。URL を見た人に伝わります。
      </p>

      <button
        type="button"
        onClick={onCancel}
        className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600"
      >
        やめる
      </button>
    </Modal>
  );
}
