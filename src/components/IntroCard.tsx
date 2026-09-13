"use client";

import { useEffect, useId, useRef, useState } from "react";

import { KINDS } from "@/lib/kinds";

/**
 * 初回に出す説明。答える問いと、主張2つ（災害種別で分かれること・緊急避難場所と
 * 避難所は別物）を、地図を見る前の5秒で渡すために置いている。
 *
 * 常設の帯にはしない。スマホでは地図の高さを毎回削ることになるし、
 * 2回目以降の利用者には読まれずに邪魔になるだけ。読んだら閉じられて、
 * ヘッダの「？」でいつでも戻せる形にした。
 *
 * **中身は削ったが、言うことは減らしていない。** 「5秒で渡す」と書いておきながら
 * 本文が 300 字あり、いちばん最初に出る画面でそれを読ませていた。
 * 落としたのは操作の説明（絞り込みの使い方）と重複した言い回しで、
 * 主張2つ・凡例・拠点でできること・データの限界は残している。
 *
 * 閉じたことは localStorage に持つ。サーバー側では読めないので、素直に書くと
 * 2回目以降の利用者に「カードが出てから消える」ちらつきが出る。
 * 描画前に走るインラインスクリプトで隠しておく（Next.js の
 * 「Preventing flash before hydration」と同じ手）。
 */
const STORAGE_KEY = "wagaya-nigesaki:intro-dismissed";

export default function IntroCard() {
  const id = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  // インラインスクリプトと同じ値を読む。どちらも localStorage を見るので、
  // React の初期状態と DOM が食い違わない。
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // プライベートブラウジングなどで書けなくても、閉じること自体は効かせる。
    }
  };

  useEffect(() => {
    if (dismissed) return;
    // 出ているあいだはカードへ移す。2回目以降は dismissed が真のまま入るので、
    // ここは走らない（＝黙って読み込んだ画面のフォーカスを奪わない）。
    cardRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissed]);

  return (
    <>
      <button
        type="button"
        aria-label="このサイトについて"
        onClick={() => setDismissed(false)}
        className="ml-auto shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-50"
      >
        ？
      </button>

      {/*
        display を切り替える要素には flex などの display 系のクラスを置かない。
        中身は1つ内側で組む。
      */}
      <div id={id} className={dismissed ? "hidden" : ""} suppressHydrationWarning>
        <div
          /*
            **あふれたら中でスクロールさせる。** 中身は小さい端末で画面の高さを
            超える。items-end のままだと超えたぶんが上端（＝見出し）から切れて、
            body が overflow-hidden なので追いかける手段が無かった。
            flex の auto マージンなら、収まるときは寄って、あふれたら素直に流れる。
          */
          className="fixed inset-0 z-30 flex overflow-y-auto overscroll-contain bg-zinc-900/20 p-3"
          onClick={close}
        >
          {/* 背景を押すと閉じる。中身を押しても閉じない。 */}
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label="このサイトについて"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto mt-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl outline-none sm:m-auto"
          >
            <p className="text-[11px] font-medium tracking-wide text-zinc-500">
              この地図が答えること
            </p>
            <h2 className="mt-1 text-base leading-snug font-semibold text-zinc-900">
              この災害のとき、近くのどこへ逃げられるか
            </h2>

            <ul className="mt-3 flex flex-col gap-3 text-[13px] leading-relaxed text-zinc-600">
              <li>
                <span className="font-semibold text-zinc-900">
                  避難場所は、災害の種類ごとに使える・使えないが分かれています。
                </span>
                <br />
                洪水では使えない場所があります。
              </li>
              <li>
                <span className="font-semibold text-zinc-900">
                  「緊急避難場所」と「避難所」は別物です。
                </span>
                <br />
                {KINDS.map((kind) => (
                  <span
                    key={kind.key}
                    className="mt-1 flex items-baseline gap-1.5"
                  >
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: kind.color }}
                    />
                    <span>
                      <span className="font-medium text-zinc-800">
                        {kind.label}
                      </span>
                      ：{kind.description}
                    </span>
                  </span>
                ))}
              </li>
            </ul>

            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-zinc-700">
              <span className="font-semibold text-zinc-900">
                自宅・職場を「拠点」として保存できます。
              </span>
              <br />
              拠点ごとの表が1枚できて、URL で家族に送れます（ログイン不要）。
              紙にも出せます。
            </p>

            <p className="mt-3 border-t border-zinc-100 pt-3 text-[11px] leading-relaxed text-zinc-500">
              データは市町村が公開に同意したものに限られます（下の出典と注意書きを参照）。
            </p>

            <button
              type="button"
              onClick={close}
              className="mt-3 min-h-11 w-full rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              地図を見る
            </button>
          </div>
        </div>
      </div>

      {/*
        描画前に隠す。React が描く前の HTML を直接いじるので、上の要素には
        suppressHydrationWarning を付けて DOM 側を勝たせている。
        開発時の警告を避けるため、クライアントでは type を text/plain にして実行させない。
      */}
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `{try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="1"){var n=document.getElementById(${JSON.stringify(id)});if(n)n.classList.add("hidden")}}catch(e){}}`,
        }}
      />
    </>
  );
}
