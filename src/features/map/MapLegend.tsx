import { KINDS } from "@/lib/kinds";

/**
 * 地図の点の凡例。**常設する。**
 *
 * **これまで凡例がどこにも無かった。** 地図には橙と青の点が出ているのに、
 * 色の意味は初回カード（閉じたら「？」を押すまで戻らない）と絞り込みの
 * ドロップダウン（畳んである）の中にしか無く、**地図を見ている状態からは
 * どちらにも届かなかった**。2色で描いている以上、これは欠落だった。
 *
 * **役割まで1行に入れる。** 色と名前だけでも凡例にはなるが、それだと
 * 「緊急避難場所と避難所は別物」（主張2）は名前の違いとしてしか伝わらない。
 * 詳細から定型文を外したとき（ShelterDetailView）、主張2を担う場所を
 * 文脈のあるところへ寄せる整理をしていて、**地図にとってはここがその場所**になる。
 * 全文（kinds.ts の description）は2つ並べると4行あって載らないので、
 * 最短形（shortDescription）を使う。
 *
 * 置き場所は左上の重ねものの列。右上はズームと現在地、右下は地理院タイルの
 * attribution、下はパネルのシートで、**狭い画面で常に空いているのはここだけ**。
 *
 * 角丸が rounded-full ではなく rounded-2xl なのは**折り返したときのため**。
 * 実測で幅は約 342px 要り、iPhone SE 相当（使える幅 351px）には収まるが、
 * 360px 幅の端末では2行になる。1行のときは高さ 28px に対して半径が
 * 14px に丸められて rounded-full と同じ見た目になり、2行になったときだけ
 * 角丸の箱として素直に見える。
 */
export default function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-2xl bg-white/95 px-3 py-1.5 text-xs shadow-sm ring-1 ring-black/10">
      {KINDS.map((kind) => (
        <span
          key={kind.key}
          className="flex items-center gap-1.5 whitespace-nowrap"
        >
          <span
            className="size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
            style={{ backgroundColor: kind.color }}
          />
          <span className="font-medium text-zinc-900">{kind.shortLabel}</span>
          <span className="text-zinc-600">{kind.shortDescription}</span>
        </span>
      ))}
    </div>
  );
}
