/** パネルの中で繰り返し使う、ごく小さいもの。 */

/** 読み込み中・失敗・0件のような、中身の代わりに置く1文。 */
export function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs leading-relaxed text-zinc-500">
      {children}
    </p>
  );
}

/**
 * 逃げ先が無い行の印。避難場所の点（塗りつぶしの丸）と同じ位置・同じ大きさの
 * 輪郭だけの丸にして、「ここに入るものが無い」ことを列の中で見せる。
 */
export function MissingDot() {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full border border-zinc-400"
    />
  );
}
