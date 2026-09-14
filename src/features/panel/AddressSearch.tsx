"use client";

import { useEffect, useId, useRef, useState } from "react";

import { api, fetchJson } from "@/client/api";
import type { GeocodeHit } from "@/lib/address";

/**
 * 住所から地図を寄せる。
 *
 * 引っ越し先を調べるとき、人が持っているのは地図上の位置ではなく**住所の文字列**なので、
 * これが拠点を置くいちばん短い道になる。町丁目まで。番地は持っていない
 * （近い順は半径2kmから広げるので、代表点との差は最寄りの順位をほとんど変えない）。
 *
 * 候補は自前の Postgres から返る。実行時に外部のジオコーディング API は叩かない
 * （.local/PLAN.md「住所検索のジオコーディング」）。
 *
 * **キーボードで完結させる。** 住所を打ち終えたら Enter を押すのが検索欄の作法で、
 * 以前はそれが何も起こさなかった（`<form>` も `onKeyDown` も無かった）。
 * ↑↓ で候補を選べるようにもしてある。**ただし変換中のキーは IME のもの**なので、
 * 日本語の入力欄では必ず先に逃がすこと（漢字を確定する Enter で候補が決まってしまう）。
 */
export default function AddressSearch({
  onPick,
  inputRef,
}: {
  onPick: (hit: GeocodeHit) => void;
  /** 外から「ここに入れてください」と焦点を渡すための口（起点がまだ無いときの案内） */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [failed, setFailed] = useState(false);
  /** ↑↓ で選んでいる候補。-1 は「まだ選んでいない」 */
  const [active, setActive] = useState(-1);

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
        // URL の組み立て（正規化を含む）は src/client/api.ts に寄せてある。
        setHits(await fetchJson<GeocodeHit[]>(api.geocode(key), controller.signal));
        // 候補が入れ替わったら選び直し。前の並びの位置を引き継がない。
        setActive(-1);
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

  // ↑↓ で選んだ候補が枠の外に出ていたら送る（max-h-40 で4件ほどしか見えない）。
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (hit: GeocodeHit) => {
    setQuery(hit.label);
    setHits([]);
    setActive(-1);
    onPick(hit);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // 変換中の Enter・↑↓ は IME のもの。横取りすると漢字が確定できない。
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Escape") {
      setHits([]);
      setActive(-1);
      return;
    }
    if (visible.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % visible.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        index <= 0 ? visible.length - 1 : index - 1,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // 何も選んでいなければ先頭。打ち終えて Enter を押す人は、たいてい一番上を指している。
      const index = active >= 0 && active < visible.length ? active : 0;
      pick(visible[index]);
    }
  };

  return (
    <div>
      {/*
        **16px を下回らせない。** これより小さい入力欄に触れると、iOS Safari は
        ページごと拡大する（viewport は拡大を許可してあるので条件が揃う。
        地図をピンチで拡大したいから、そこは禁止しない）。
        住所を打ち始めた瞬間に画面が飛ぶのは、拠点を置く道のいちばん最初で起きる事故。
      */}
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="住所で探す（例: 千代田区内幸町）"
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-expanded={visible.length > 0}
        aria-controls={visible.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />

      {failed && (
        <p className="mt-1 text-xs text-zinc-500">
          住所を引けませんでした。地図を動かして決めることもできます。
        </p>
      )}

      {visible.length > 0 && (
        /*
          候補は combobox の作法どおり listbox で出す。行はタブ移動の対象にせず、
          入力欄に居たまま ↑↓ と Enter で決められるようにする
          （aria-activedescendant が、いまどれを選んでいるかを読み上げに渡す）。
        */
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="mt-1 max-h-40 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200"
        >
          {visible.map((hit, index) => (
            <li
              key={hit.label}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onClick={() => pick(hit)}
              // 指で押し分けられる高さにする（11px の行が並ぶ一覧は、狙って押せない）。
              className={`cursor-pointer border-b border-zinc-100 px-2.5 py-2.5 text-sm text-zinc-800 last:border-b-0 ${
                index === active ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
            >
              {hit.label}
            </li>
          ))}
        </ul>
      )}

      {ready && !failed && visible.length === 0 && (
        <p className="mt-1 text-xs text-zinc-500">
          該当する町名が見つかりません（番地までは持っていません）
        </p>
      )}
    </div>
  );
}
