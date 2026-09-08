/**
 * 出典表示は国土地理院コンテンツ利用規約（公共データ利用規約 PDL1.0）上の義務。
 * 加工しているので「もとに作成」の一文も省略できない。常設し、消さない。
 */
export default function SiteFooter() {
  return (
    <footer className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
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
      </p>
      <p>
        市町村が登録し公開に同意したものに限られ、最新でない場合や未掲載の場合があります。
        実際の避難では必ず市町村の指示に従ってください。
      </p>
    </footer>
  );
}
