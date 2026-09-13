"use client";

import { useEffect, useId, useState } from "react";

import { KINDS } from "@/lib/kinds";

/**
 * 初回に出す説明。答える問いと、主張2つ（災害種別で分かれること・緊急避難場所と
 * 避難所は別物）を、地図を見る前の5秒で渡すために置いている。
 *
 * 常設の帯にはしない。スマホでは地図の高さを毎回削ることになるし、
 * 2回目以降の利用者には読まれずに邪魔になるだけ。読んだら閉じられて、
 * ヘッダの「？」でいつでも戻せる形にした。
 *
 * 閉じたことは localStorage に持つ。サーバー側では読めないので、素直に書くと
 * 2回目以降の利用者に「カードが出てから消える」ちらつきが出る。
 * 描画前に走るインラインスクリプトで隠しておく（Next.js の
 * 「Preventing flash before hydration」と同じ手）。
 */
const STORAGE_KEY = "wagaya-nigesaki:intro-dismissed";

export default function IntroCard() {
  const id = useId();

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
          role="dialog"
          aria-modal="true"
          aria-label="このサイトについて"
          className="fixed inset-0 z-30 flex items-end justify-center bg-zinc-900/20 p-3 sm:items-center"
          onClick={close}
        >
          {/* 背景を押すと閉じる。中身を押しても閉じない。 */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
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
                洪水では使えない場所があります。上のボタンで災害を選ぶと、
                その災害で使える場所だけが地図に残ります。
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
              拠点ごとに「8種の災害 × それぞれの最寄り」が1枚の表になります。
              保存した拠点は URL に入るので、ログインなしで家族に送れて、
              QR コードで紙に出して貼っておけます。
            </p>

            <p className="mt-3 border-t border-zinc-100 pt-3 text-[11px] leading-relaxed text-zinc-500">
              データは市町村が登録し公開に同意したものに限られます
              （最下部の注意書きを参照してください）。
            </p>

            <button
              type="button"
              onClick={close}
              className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
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
