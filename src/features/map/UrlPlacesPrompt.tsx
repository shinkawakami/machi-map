"use client";

import * as placesStore from "@/client/places-store";
import Modal from "@/components/Modal";
import type { Place } from "@/lib/places";

/**
 * URL で届いた拠点と、この端末に保存されている拠点が食い違ったときの3択。
 *
 * 送られた URL を開いただけで、この端末の拠点が消えるのは事故。必ず聞く。
 * **答えるまで背後を触らせない**（Modal に閉じ方を渡さない）。
 * 以前は背後が押せたので、3択を出したまま拠点を保存でき、その保存が
 * syncUrl でフラグメントを書き換えて、届いたほうの拠点を消していた。
 */
export default function UrlPlacesPrompt({ offered }: { offered: Place[] }) {
  return (
    <Modal label="この URL に入っている場所を使いますか">
      <p className="text-sm font-semibold text-zinc-900">
        この URL に{offered.length}つの場所が入っています
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        {offered.map((p) => p.name).join("・")}
        。この端末には別の拠点が保存されています。どちらを使いますか。
      </p>
      <button
        type="button"
        onClick={() => placesStore.acceptOffered(true)}
        className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
      >
        URL の場所に入れ替える
      </button>
      <button
        type="button"
        onClick={() => placesStore.acceptOffered(false)}
        className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
      >
        今回だけ見る（保存しない）
      </button>
      <button
        type="button"
        onClick={() => placesStore.keepCurrent()}
        className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-zinc-600"
      >
        この端末の拠点を使う
      </button>
    </Modal>
  );
}
