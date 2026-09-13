"use client";

import { useEffect, useState } from "react";

import type { GeocodeHit } from "@/lib/geocode";

/**
 * 住所から地図を寄せる。
 *
 * 引っ越し先を調べるとき、人が持っているのは地図上の位置ではなく**住所の文字列**なので、
 * これが拠点を置くいちばん短い道になる。町丁目まで。番地は持っていない
 * （近い順は半径2kmから広げるので、代表点との差は最寄りの順位をほとんど変えない）。
 *
 * 候補は自前の Postgres から返る。実行時に外部のジオコーディング API は叩かない
 * （.local/PLAN.md「住所検索のジオコーディング」）。
 */
export default function AddressSearch({
  onPick,
}: {
  onPick: (hit: GeocodeHit) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [failed, setFailed] = useState(false);

  const key = query.trim();
  // 1文字では候補が多すぎて選ぶ役に立たない。出す・出さないは描画側で決め、
  // state はいじらない（effect の中で同期的に setState しない）。
  const ready = key.length >= 2;

  useEffect(() => {
    if (key.length < 2) return;
    const controller = new AbortController();

    // 打っている途中で毎文字投げない。止まってから引く。
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(key)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        setHits(await res.json());
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const visible = ready ? hits : [];

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="住所で探す（例: 千代田区内幸町）"
        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
      />

      {failed && (
        <p className="mt-1 text-[11px] text-zinc-500">
          住所を引けませんでした。地図を動かして決めることもできます。
        </p>
      )}

      {visible.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200">
          {visible.map((hit) => (
            <li key={hit.label} className="border-b border-zinc-100 last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  setQuery(hit.label);
                  setHits([]);
                  onPick(hit);
                }}
                className="w-full px-2.5 py-2 text-left text-xs text-zinc-800 hover:bg-zinc-50"
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {ready && !failed && visible.length === 0 && (
        <p className="mt-1 text-[11px] text-zinc-500">
          該当する町名が見つかりません（番地までは持っていません）
        </p>
      )}
    </div>
  );
}
