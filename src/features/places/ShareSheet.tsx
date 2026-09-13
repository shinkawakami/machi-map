"use client";

import { useState } from "react";

import Modal from "@/components/Modal";
import QrCode from "@/components/QrCode";
import { shareUrl } from "@/client/places-url";
import { type Place, placesHash } from "@/lib/places";

/**
 * 拠点を家族に送る／紙に残すための一式。
 *
 * URL が正本なので、**送ることがそのままバックアップを兼ねる**。
 * ただし LINE の履歴は流れるしブックマークも消えるので、
 * 「送る」だけでなく「残す」側（QR と印刷）を同じ場所に置く。
 *
 * **送る拠点は選べるようにする。** 保存したものを丸ごと入れていたころは、
 * 実家の場所を兄弟に送るだけのつもりで職場も学校も一緒に届いていた。
 * URL に位置が入ること自体は設計どおり（中身が読めるほうが、届いた側が
 * 扱いを誤らない）なので、手当てするのは**入る量のほう**。
 */
export default function ShareSheet({
  places,
  onClose,
}: {
  places: Place[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  /** 送るものの名前。名前は拠点の鍵（savePlace が同名を置き換える）。 */
  const [sending, setSending] = useState<string[]>(() =>
    places.map((p) => p.name),
  );

  // 拠点が1つしかないなら選ばせる意味がない。チェックは出さない。
  const choosable = places.length > 1;
  const chosen = choosable
    ? places.filter((p) => sending.includes(p.name))
    : places;

  const url = shareUrl(chosen);

  const toggle = (name: string) =>
    setSending((current) =>
      current.includes(name)
        ? current.filter((n) => n !== name)
        : [...current, name],
    );

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
    <Modal label="この拠点を送る・残す" onClose={onClose}>
      <p className="text-sm font-semibold text-zinc-900">
        {choosable ? "送る場所を選ぶ" : "この拠点を送る・残す"}
      </p>

      {choosable ? (
        <ul className="mt-2">
          {places.map((place) => (
            <li key={place.name}>
              {/* 行ごと押せるようにする。指で押し分けられる高さを確保する。 */}
              <label className="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={sending.includes(place.name)}
                  onChange={() => toggle(place.name)}
                  className="size-5 accent-zinc-900"
                />
                {place.name}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {places.map((p) => p.name).join("・")}
          が URL に入っています。この URL が正本なので、送っておけば
          端末が変わっても戻せます。
        </p>
      )}

      {chosen.length === 0 ? (
        <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-4 text-center text-xs text-zinc-600">
          送る場所を1つ以上選んでください。
        </p>
      ) : (
        <>
          {choosable && (
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {chosen.map((p) => p.name).join("・")}
              が URL に入ります。この URL が正本なので、送っておけば
              端末が変わっても戻せます。
            </p>
          )}

          <div className="mt-3 flex justify-center">
            <QrCode value={url} size={168} />
          </div>

          <p className="mt-2 break-all text-[11px] leading-relaxed text-zinc-500">
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
            href={`/print${placesHash(chosen)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
          >
            印刷する（災害別の表）
          </a>
        </>
      )}

      {/* 後半は「送る前に知っておくこと」なので、薄い色で置かない。 */}
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
        災害のときにスマホが使えるとは限りません。紙に出して貼っておくのが確実です。
        URL には選んだ場所の位置が入るので、公開の場には貼らないでください。
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-zinc-600"
      >
        閉じる
      </button>
    </Modal>
  );
}
