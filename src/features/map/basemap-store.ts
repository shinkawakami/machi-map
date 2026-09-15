"use client";

import { useSyncExternalStore } from "react";

import {
  BASEMAPS,
  type BasemapKey,
  DEFAULT_BASEMAP,
} from "@/features/map/map-style";

/**
 * 選んだ背景地図の置き場。**この端末の localStorage だけ。**
 *
 * 拠点は URL が正本だが（src/lib/places.ts）、背景地図はそれと性質が違う。
 * **共有した相手に押しつけるものではない**ので、URL には載せない。
 * 送られた URL はいつでも既定（淡色＝避難場所の点がいちばん読みやすい）から始まる。
 *
 * 逆に、同じ端末で開き直すたびに戻るのも困る（写真で見たい人は毎回写真にしたい）。
 * 端末に覚えて、そこで閉じる。
 *
 * **読む先が React の外にあるので、外部ストアとして読む**（places-store.ts と同じ）。
 * effect の中で setState して入れ替える形にすると、サーバー側の描画（既定）との
 * 食い違いをカスケードした再描画で埋めることになる。
 */

const STORAGE_KEY = "wagaya-nigesaki:basemap";

/** 一度読んだら控える。localStorage を書き換えるのはこのモジュールだけ。 */
let snapshot: BasemapKey | null = null;
const listeners = new Set<() => void>();

/** 読めないこと・消えていること・知らない値が入っていることを前提に、既定へ倒す。 */
function read(): BasemapKey {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const known = BASEMAPS.find((b) => b.key === saved);
    return known ? known.key : DEFAULT_BASEMAP;
  } catch {
    return DEFAULT_BASEMAP;
  }
}

/** いま選ばれている背景地図。ブラウザでしか呼べない（地図を作る側から読む）。 */
export function currentBasemap(): BasemapKey {
  snapshot ??= read();
  return snapshot;
}

/** サーバー側では読めない。既定から始めて、水和のあとに読み直す。 */
function getServerSnapshot(): BasemapKey {
  return DEFAULT_BASEMAP;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBasemap(): BasemapKey {
  return useSyncExternalStore(subscribe, currentBasemap, getServerSnapshot);
}

/** 背景地図を変える。次に開いたときも同じ見え方で始められるよう覚える。 */
export function setBasemap(next: BasemapKey): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // プライベートブラウジングなどで書けなくても、その回は選べている。
  }
  for (const listener of listeners) listener();
}
