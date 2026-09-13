"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * しばらくのあいだだけ出しておく申し出（「元に戻す」の帯）。
 *
 * 拠点を消したときと、地図を押して起点が移ったときの2か所で使う。どちらも
 * **1タップで起きて、取り違えると痛い**が、確認ダイアログで毎回止めるほどでもない。
 * 押しやすいまま、しばらく戻せる状態を残す。
 *
 * 出しっぱなしの時計は、新しい申し出が来たら引き直す。
 */
export function useTimedOffer<T>(
  ms: number,
): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offer = useCallback(
    (next: T | null) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(next);
      if (next !== null) {
        timer.current = setTimeout(() => setValue(null), ms);
      }
    },
    [ms],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [value, offer];
}
