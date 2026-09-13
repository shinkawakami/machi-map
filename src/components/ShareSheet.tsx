"use client";

import { useState } from "react";

import QrCode from "@/components/QrCode";
import { placesHash, type Place, shareUrl } from "@/lib/places";

/**
 * 拠点を家族に送る／紙に残すための一式。
 *
 * URL が正本なので、**送ることがそのままバックアップを兼ねる**。
 * ただし LINE の履歴は流れるしブックマークも消えるので、
 * 「送る」だけでなく「残す」側（QR と印刷）を同じ場所に置く。
 */
export default function ShareSheet({
  places,
  onClose,
}: {
  places: Place[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(places);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
        <p className="text-sm font-semibold text-zinc-900">
          この拠点を送る・残す
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {places.map((p) => p.name).join("・")}
          が URL に入っています。この URL が正本なので、送っておけば
          端末が変わっても戻せます。
        </p>

        <div className="mt-3 flex justify-center">
          <QrCode value={url} size={168} />
        </div>

        <p className="mt-2 break-all text-[10px] leading-relaxed text-zinc-400">
          {url}
        </p>

        <button
          type="button"
          onClick={copy}
          className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          {copied ? "コピーしました" : "URL をコピー"}
        </button>
        <a
          href={`/print${placesHash(places)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          印刷する（災害別の表）
        </a>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          災害のときにスマホが使えるとは限りません。紙に出して貼っておくのが確実です。
          URL には保存した場所の位置が入るので、公開の場には貼らないでください。
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-zinc-500"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
