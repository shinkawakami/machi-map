"use client";

import { useEffect, useState } from "react";

import { errorMessage, fetchJson } from "@/client/api";

/**
 * URL から JSON を取って、読み込み中・失敗・結果の3状態で返す。
 *
 * **同じ 20 行を4か所が写していた**（災害別の表・近い順・詳細・印刷）。
 * どれも「AbortController を作る → fetch → res.ok を見る → setState →
 * aborted なら黙る → クリーンアップで abort」で、違うのは URL と型だけ。
 * 写しが増えるほど、中断の扱いを1か所だけ直し忘れる形になる。
 *
 * **URL が変わったら、前の結果は出さない。** 起点を変えた直後に古い拠点の表が
 * 残っていると、動いたのかどうかが読めない。以前は呼ぶ側が `key` を付けて
 * 部品ごと作り直していたが、作り直す単位（起点だけ／起点＋絞り込み）を
 * 呼ぶ側が組み立てる必要があった。**URL がその単位そのもの**なので、
 * ここで面倒を見る。
 */
export type Resource<T> = {
  data: T | null;
  /** 失敗の1文。読み込み中は data も error も null（呼ぶ側が「調べています…」を出す） */
  error: string | null;
};

export function useResource<T>(url: string): Resource<T> {
  const [state, setState] = useState<{
    url: string | null;
    data: T | null;
    error: string | null;
  }>({ url: null, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchJson<T>(url, controller.signal);
        setState({ url, data, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ url, data: null, error: errorMessage(error) });
      }
    })();

    return () => controller.abort();
  }, [url]);

  // 取りにいっている先と、手元にある結果が食い違っているあいだは空で返す。
  // setState で消すと描画が1回増えるので、読むときに落とす。
  if (state.url !== url) return { data: null, error: null };
  return { data: state.data, error: state.error };
}
