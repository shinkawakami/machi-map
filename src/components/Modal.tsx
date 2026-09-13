"use client";

import { useEffect, useRef } from "react";

/**
 * 画面を止めて聞くためのモーダル。
 *
 * **背景を本当に塞ぐ。** 以前は枠を `pointer-events-none` にしていたので、
 * 開いたまま背後の地図が押せた。保存ダイアログの裏で起点を動かすと
 * 押した覚えのない座標が保存され、URL で届いた拠点の3択を無視したまま
 * 拠点を保存すると `syncUrl` が走って**届いた URL のほうが消えた**。
 * 聞く以上は、答えるまで他を触らせない。
 *
 * **縦にあふれたら中でスクロールさせる。** 小さい端末では QR や説明で
 * 画面の高さを超える。`items-center` だと超えたぶんが上端から切れて、
 * `body` が `overflow-hidden` なので追いかける手段が無かった。
 * flex の auto マージンで寄せると、収まるときは中央、あふれるときは
 * 上端から素直に流れる。
 */
export default function Modal({
  label,
  onClose,
  className = "max-w-xs",
  children,
}: {
  /** 読み上げに渡す名前 */
  label: string;
  /** 背景と Esc で閉じられるとき。答えを選ばせたいものでは渡さない */
  onClose?: () => void;
  /** カードの幅など */
  className?: string;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // 開いたらカードへ移す。ここへ移さないと、読み上げも Tab も背後に残る。
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex overflow-y-auto overscroll-contain bg-zinc-900/30 p-4"
      onClick={onClose}
    >
      {/* 背景を押すと閉じる（閉じ方があるときだけ）。中身を押しても閉じない。 */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`m-auto w-full rounded-xl border border-zinc-200 bg-white p-4 shadow-xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
