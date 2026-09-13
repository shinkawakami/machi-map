import Link from "next/link";

/**
 * 出典表示は国土地理院コンテンツ利用規約（公共データ利用規約 PDL1.0）上の義務。
 * 加工しているので「もとに作成」の一文も省略できない。常設し、消さない。
 *
 * **ただし常設と全文常時表示は別の話。** 全文は 11px で6行あり、iPhone 幅では
 * **約 120px** を固定で食う。ヘッダ（約 37px）と合わせると、iPhone SE 相当
 * （667px）では地図に使える高さが 506px まで落ち、そこへ下のシートが 65% 入るので、
 * **見えている地図は 175px 前後**しか残らない。地図が主役の画面で、この配分は逆。
 *
 * そこで**権利者と「もとに作成」の一文だけを常に見せ、残りを開いて読む形**にした。
 * 3つのデータ源の権利者（国土地理院・国土交通省）は畳んだ状態でも名乗っているし、
 * 背景地図の出典は地図右下の attribution（`AttributionControl({ compact: true })`）にも
 * 常設で出ている。地図まわりで広く使われている畳み方と同じ姿勢に揃える。
 */
export default function SiteFooter() {
  return (
    <footer className="shrink-0 border-t border-zinc-200 bg-white text-[11px] leading-relaxed text-zinc-500">
      <details className="group">
        {/*
          畳んだときに残る1行。**権利者名と「もとに作成」を落とさない。**
          リンクは開いた側に置く（summary の中のリンクは、押すと開閉も一緒に起きる）。
        */}
        <summary className="flex cursor-pointer list-none items-baseline gap-1.5 px-3 py-2 marker:content-none hover:text-zinc-700">
          {/* 幅が足りないときは折り返す。出典は切り詰めない。 */}
          <span className="min-w-0 flex-1">
            出典：国土地理院・国土交通省のデータをもとに作成
          </span>
          <span className="shrink-0 text-zinc-400 group-open:hidden">詳しく ▾</span>
          <span className="hidden shrink-0 text-zinc-400 group-open:inline">
            閉じる ▴
          </span>
        </summary>

        <div className="px-3 pb-2">
          <p>
            出典：
            <a
              className="underline underline-offset-2 hover:text-zinc-800"
              href="https://www.gsi.go.jp/bousaichiri/hinanbasho.html"
              target="_blank"
              rel="noreferrer"
            >
              国土地理院ウェブサイト
            </a>
            （指定緊急避難場所データ・指定避難所データ）をもとに作成／背景地図：
            <a
              className="underline underline-offset-2 hover:text-zinc-800"
              href="https://maps.gsi.go.jp/development/ichiran.html"
              target="_blank"
              rel="noreferrer"
            >
              地理院タイル
            </a>
            ／住所検索：
            <a
              className="underline underline-offset-2 hover:text-zinc-800"
              href="https://nlftp.mlit.go.jp/isj/"
              target="_blank"
              rel="noreferrer"
            >
              位置参照情報ダウンロードサービス
            </a>
            （国土交通省）をもとに作成
          </p>
          <p>
            市町村が登録し公開に同意したものに限られ、最新でない場合や未掲載の場合があります。
            実際の避難では必ず市町村の指示に従ってください。
            <Link
              className="ml-1 underline underline-offset-2 hover:text-zinc-800"
              href="/coverage"
            >
              データの公開状況
            </Link>
          </p>
        </div>
      </details>
    </footer>
  );
}
