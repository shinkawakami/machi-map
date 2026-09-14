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
  /**
   * 置き換えの確認を待っている名前。
   *
   * **同じ名前で保存すると、前の座標は黙って消える**（savePlace は名前が鍵）。
   * 拠点の削除には戻す帯があるのに、上書きには何も無かった。「上書き」と
   * 小さく添えるだけでは、押したあとに気づいても遅い。**押す前に一度止める。**
   * 止めるのは置き換わるときだけで、新しい名前は今までどおり1タップで保存できる。
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  const choose = (name: string) => {
    if (!usedNames.includes(name) || confirming === name) {
      onSave(name);
      return;
    }
    setConfirming(name);
  };

  return (
    <Modal label="この場所を拠点として保存します" onClose={onCancel}>
      <p className="text-sm font-semibold text-zinc-900">
        この場所を拠点として保存します
      </p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-500">
        保存した拠点は URL に入ります。次に開くときも、家族に送るときも、
        この URL が正本です。
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PLACE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => choose(preset)}
            className={`min-h-10 rounded-full border px-3.5 text-sm transition-colors ${
              confirming === preset
                ? "border-amber-400 bg-amber-50 font-semibold text-zinc-900"
                : "border-zinc-300 text-zinc-800 hover:bg-zinc-50"
            }`}
          >
            {preset}
            {usedNames.includes(preset) && (
              <span className="ml-1 text-xs text-zinc-500">
                {confirming === preset ? "もう一度" : "上書き"}
              </span>
            )}
          </button>
        ))}
      </div>

      {confirming && (
        <p role="status" className="mt-1.5 text-xs leading-relaxed text-zinc-700">
          いまの「{confirming}」は、この場所に置き換わります。
          続けるなら、もう一度押してください。
        </p>
      )}

      {/*
        **入力欄は 16px を下回らせない。** これより小さいと、触れた瞬間に
        iOS Safari がページごと拡大する（AddressSearch に同じ注記がある）。
        ここはダイアログの中なので、拡大されると背後との位置関係まで崩れる。
        高さは伸びるが、名前を打つ欄としてはこのくらいが素直。
      */}
      <div className="mt-3 flex gap-1.5">
        <input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setConfirming(null);
          }}
          onKeyDown={(event) => {
            // 変換中の Enter は IME のもの。名前に漢字を使えなくしない。
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && cleaned) choose(cleaned);
          }}
          placeholder="ほかの名前"
          maxLength={12}
          enterKeyHint="done"
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 text-base text-zinc-900 placeholder:text-zinc-500"
        />
        <button
          type="button"
          disabled={!cleaned}
          onClick={() => choose(cleaned)}
          className="min-h-10 shrink-0 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          保存
        </button>
      </div>
      {/*
        これは注意書きではなく、URL が家族に渡ることの帰結そのもの。
        いちばん薄い色（zinc-400・白地で 2.6:1）で置いていたのを、読める濃さに上げる。
      */}
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
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
