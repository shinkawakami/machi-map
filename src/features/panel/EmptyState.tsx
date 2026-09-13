"use client";

/**
 * 起点がまだ無いときの中身。
 *
 * **並べるのは箇条書きではなく、押せるもの。** 以前はここに 11px の「・」が4つ並び、
 * しかもそのうち1つは「地図の右上「現在地」を押す」と**画面の別の場所を指していた**。
 * 同じ重さの選択肢が4つ並ぶのは推奨が無いのと同じで、初めて来た人はそこで止まる。
 *
 * 押せるものを2つに絞る。現在地はその場で取れるので1タップで答えまで行き、
 * 住所は上の欄に焦点を渡す（**別の場所を指すのではなく、そこへ連れていく**）。
 * 地図を押す道も残っているが、これは案内が無くても触られるので1行に落とす。
 *
 * 拠点を持っている人はここへ来ない（1つ目の拠点が自動で起点になる）。
 */
export default function EmptyState({
  onLocate,
  locating,
  onEnterAddress,
}: {
  onLocate: () => void;
  locating: boolean;
  onEnterAddress: () => void;
}) {
  return (
    <div className="px-3 py-3">
      <p className="text-xs leading-relaxed text-zinc-600">
        いまは<span className="font-medium text-zinc-900">例として東京の地図</span>
        を出しています。
        <strong className="font-medium text-zinc-900">調べたい場所を決める</strong>
        と、そこから災害の種類ごとに使える避難場所が出ます。
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="flex-1 rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
        >
          {locating ? "取得中…" : "現在地から探す"}
        </button>
        <button
          type="button"
          onClick={onEnterAddress}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          住所を入れる
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        地図を押して決めることもできます（遠いときは、押すたびに寄ります）。
      </p>
    </div>
  );
}
