"use client";

import { useEffect, useRef, useState } from "react";

import type { ShelterKind } from "@/generated/prisma/enums";
import {
  canonicalDisasters,
  DISASTER_TYPES,
  type DisasterKey,
} from "@/lib/disasters";
import { KINDS } from "@/lib/kinds";
import type { ShelterFilter } from "@/lib/filter";

/**
 * 絞り込み。**1つのドロップダウンに畳んで、見方の切り替え（タブ）と同じ行に置く。**
 *
 * もとは種別2つ・福祉避難所・災害種別の4つを行に並べていた。狭い画面では必ず
 * 2行に折り返し、**その行だけで 103px**（下のシートの 28%）を使っていた。
 * 下にタブの行が別にあり、合わせて 156px。シートは iPhone SE 相当で 370px しか
 * 無いので、住所の欄・拠点の★・下段の保存/送るを足すと、**中身に残るのは 40px 弱**
 * だった。地図の下に出る答えを読む場所が、操作に食われて無くなっていた。
 *
 * 畳める理由は2つある。
 *
 * 1. **既定の画面（災害別の表）に、絞り込みは効かない。** 8種すべてが並ぶこと
 *    自体が答えなので（SummaryTable）、そこでは常時開いている必要が無い
 * 2. **絞り込んだ結果は地図に出る。** いま何で絞っているかは地図のチップが
 *    出し続けるので（src/lib/filter.ts の filterBadges）、閉じても状態は読める
 *
 * 左にセグメント・右に絞り込み、はこの種の画面で広く使われている並び。
 * タブは呼ぶ側（ShelterPanel）が持ったまま children で受け取る。絞り込みと
 * 見方の切り替えは別の仕事で、ここが両方を知る理由は無い。
 *
 * 災害種別は**複数選択**（2026-09-13 に単一選択から変えた）。
 *
 * もとは単一で、理由は「今この災害が起きたらどこへ逃げるか」に対応させるため、
 * としていた。**その問いの立て方自体を先に捨てている。** 調べるきっかけは6つ数えて
 * 5つが平時で、そのとき知りたいのは「うちの拠点は、心配な災害のどれでも使える場所を
 * 持っているか」のほう（.local/PLAN.md「利用シーンの整理」）。
 * 単一選択は、降ろしたはずの発災直後の問いだけに合わせた形だった。
 *
 * **掛け合わせは AND（選んだ災害のすべてで使える場所）。** OR にすると、
 * 地図の点が「どちらの災害で使えるのか」を点からは読めなくなる（src/lib/filter.ts）。
 */
export default function ShelterFilterBar({
  value,
  onChange,
  children,
}: {
  value: ShelterFilter;
  onChange: (next: ShelterFilter) => void;
  /** 同じ行の左に置くもの（見方の切り替えタブ）。起点がまだ無いときは空 */
  children?: React.ReactNode;
}) {
  const toggleKind = (kind: ShelterKind) => {
    const next = value.kinds.includes(kind)
      ? value.kinds.filter((k) => k !== kind)
      : [...value.kinds, kind];
    // 両方消すと空の地図になる。最後の1つは外させない。
    if (next.length === 0) {
      setHint((n) => n + 1);
      return;
    }
    /*
      **緊急避難場所を出しに来たら、福祉避難所の絞り込みは外す。**
      受入対象者は指定避難所にしかない列なので、両方立てると緊急避難場所は
      1件も出ない。押したのに何も起きない操作を残さない。
    */
    const wantsEmergency = !value.kinds.includes(kind) && kind === "EMERGENCY";
    onChange({
      ...value,
      kinds: next,
      welfareOnly: wantsEmergency ? false : value.welfareOnly,
    });
  };

  /**
   * 福祉避難所だけに絞る。
   *
   * **押すと種別も指定避難所だけに寄せる。** 受入対象者は指定避難所にしかない列で、
   * 黙って立てると緊急避難場所がすべて消える。消えた理由が画面のどこにも
   * 残らないのを避けて、**種別チップのほうも一緒に動かして目に見えるようにする**
   * （絞り込みの状態は画面に出す、という整理。src/lib/filter.ts の filterBadges）。
   */
  const toggleWelfare = () => {
    const on = !value.welfareOnly;
    onChange({
      ...value,
      welfareOnly: on,
      kinds: on ? ["SHELTER"] : value.kinds,
    });
  };

  const chosen = value.disasters;
  const shelterVisible = value.kinds.includes("SHELTER");

  /** 押すたびに入れ替える。並びの正規化は src/lib/disasters.ts に任せる。 */
  const toggleDisaster = (key: DisasterKey) => {
    const next = chosen.includes(key)
      ? chosen.filter((k) => k !== key)
      : [...chosen, key];
    onChange({ ...value, disasters: canonicalDisasters(next) });
  };

  /*
    畳んだときの見出し。**中身は並べず、効いている条件の数だけを出す。**
    3つの軸（種別・福祉避難所・災害8種）が1つのドロップダウンに入ったので、
    名前を並べると畳んである意味が消える。何で絞っているかの全文は地図の
    チップが出すので（filterBadges）、ここは「絞っている・いない」と
    その重さが読めれば足りる。
  */
  const activeCount =
    chosen.length +
    (value.welfareOnly ? 1 : 0) +
    (!value.welfareOnly && value.kinds.length === 1 ? 1 : 0);

  /*
    最後の1つを押した人に返す一言。理由は title に書いてあったが、
    **タッチ端末では title が出ない**ので、押しても何も起きない操作になっていた
    （地図右上の現在地ボタンで同じことに気づいて文字を添えたのと、同じ話）。
    押した回数を持つのは、続けて押されたときに出しっぱなしの時計を引き直すため。
  */
  const [hint, setHint] = useState(0);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(0), 2500);
    return () => clearTimeout(timer);
  }, [hint]);

  /*
    開いたら、外を押すか Esc で閉じる。<details> は summary を押し直すまで
    開いたままなので、地図を触りに行ったのに絞り込みが残る。
  */
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="shrink-0 border-b border-zinc-100">
      <div className="flex items-center gap-1 px-4 py-1">
        {children}

        <details
          ref={detailsRef}
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
          className="relative ml-auto"
        >
          {/*
            **タブと同じ行にいるので、的の大きさも字も同じにする。** 36px・13px で、
            隣の 40px・14px より一回り小さかった（items-center なので上下 2px ずつ
            内側に寄って見える）。押して状態が変わるものは 40px、はこのパネルの基準。
          */}
          <summary
            className={`flex min-h-10 cursor-pointer list-none items-center rounded-full border px-3 text-sm marker:content-none ${
              activeCount > 0
                ? "border-zinc-900 bg-zinc-900 font-medium text-white"
                : "border-zinc-200 text-zinc-600"
            }`}
          >
            絞り込み{activeCount > 0 && ` ${activeCount}`} ▾
          </summary>

          {/*
            **下のシートでは上に開く。** 中身は 250px ほどあり、シートは画面の
            下端に貼り付いている。下に開くと画面の外へ出て、body が
            overflow-hidden なので追いかける手段が無い。広い画面では左の柱の
            上のほうに居るので、そちらは下に開く。
            どちらでも足りないときのために丈を切って、中でスクロールさせる。
          */}
          <div className="absolute right-0 bottom-full z-20 mb-1 max-h-[60vh] w-[19rem] overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white p-2 shadow-lg md:top-full md:bottom-auto md:mt-1 md:mb-0">
            <p className="px-0.5 text-xs font-medium text-zinc-500">種別</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {KINDS.map((kind) => {
                const on = value.kinds.includes(kind.key);
                const last = on && value.kinds.length === 1;
                return (
                  <button
                    key={kind.key}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={last}
                    title={last ? "どちらかは表示します" : kind.description}
                    onClick={() => toggleKind(kind.key)}
                    className={`flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-[13px] transition-colors ${
                      on
                        ? "border-zinc-300 bg-zinc-100 font-medium text-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-500"
                    }`}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                      style={{ backgroundColor: on ? kind.color : "#d4d4d8" }}
                    />
                    {kind.shortLabel}
                  </button>
                );
              })}

              {/*
                福祉避難所は種別の並びに置く。災害種別（緊急避難場所の属性）とは
                別の軸で、指定避難所の中の絞り込みにあたるため。
              */}
              <button
                type="button"
                aria-pressed={value.welfareOnly}
                title="受入対象者の定めがある指定避難所"
                onClick={toggleWelfare}
                className={`flex min-h-9 items-center rounded-full border px-2.5 text-[13px] transition-colors ${
                  value.welfareOnly
                    ? "border-zinc-300 bg-zinc-100 font-medium text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-500"
                }`}
              >
                福祉避難所
              </button>
            </div>

            <p className="mt-3 px-0.5 text-xs font-medium text-zinc-500">
              災害で絞る
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {/*
                **選んでも閉じない。** 複数選ぶ前提なので、1つ押すたびに閉じると
                開き直しの繰り返しになる。閉じ方は外を押すか Esc（上の effect）。
              */}
              <DisasterChip
                selected={chosen.length === 0}
                onClick={() => onChange({ ...value, disasters: [] })}
              >
                すべて
              </DisasterChip>
              {DISASTER_TYPES.map((disaster) => (
                <DisasterChip
                  key={disaster.key}
                  selected={chosen.includes(disaster.key)}
                  title={disaster.sourceLabel}
                  onClick={() => toggleDisaster(disaster.key)}
                >
                  {disaster.label}
                </DisasterChip>
              ))}
            </div>

            <div className="mt-2 border-t border-zinc-100 pt-2 text-xs leading-snug text-zinc-500">
              {/*
                **どこに効くのかは、押す前に言う。** 効かない画面（災害別の表）の
                上に断り書きを常設するより、操作する場所で先に言うほうが早い。
              */}
              <p>絞り込みは地図と「近い順」に効きます（災害別の表は8種すべて）。</p>
              {/*
                **AND であることは、2つ目を押した人にだけ言う。** 1つしか選んで
                いない人には関係がなく、常設すると誰も食い違っていない場面で
                全員が読まされる（表の上の断り書きで同じことをやって直した）。
              */}
              {chosen.length > 1 && (
                <p className="mt-1">
                  選んだ{chosen.length}種の
                  <strong className="font-medium text-zinc-700">すべてで使える</strong>
                  場所に絞ります（どれかで使える場所、ではありません）
                </p>
              )}
              {/*
                指定避難所に災害種別の指定は存在しない。黙って全部残すと
                「洪水で使える避難所」だと読まれてしまうので、そのときだけ断る。
              */}
              {chosen.length > 0 && shelterVisible && (
                <p className="mt-1">
                  {KINDS[1].label}には災害種別の指定がないため、絞り込みの対象外です
                </p>
              )}
            </div>
          </div>
        </details>
      </div>

      {/*
        **開設されるとは限らないことを、絞っているあいだは出しっぱなしにする。**
        福祉避難所は市町村が開設を判断し、対象者も事前に定められていることが多い。
        「最寄りの福祉避難所」を行き先として読まれると、このアプリが
        出してはいけない側の案内になる。ここは字数を惜しまない。
        **畳んだドロップダウンの中には入れない。** 閉じると消える場所に置くと、
        絞り込んだまま結果だけを読んでいる人には一度も届かない。
      */}
      {value.welfareOnly && (
        <p className="px-4 pt-0.5 pb-2 text-xs leading-relaxed text-zinc-600">
          受入対象者の定めがある指定避難所です。
          <strong className="font-medium text-zinc-900">
            開設するかは市町村が判断し、対象者も定められています。
          </strong>
          受け入れの条件は各施設の詳細（受入対象者）と、お住まいの市町村で確認してください。
        </p>
      )}

      {hint > 0 && (
        <p role="status" className="px-4 pt-0.5 pb-2 text-xs text-zinc-600">
          {KINDS.map((k) => k.shortLabel).join("・")}
          のどちらかは地図に出します。
        </p>
      )}
    </div>
  );
}

function DisasterChip({
  selected,
  title,
  onClick,
  children,
}: {
  selected: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={`min-h-9 shrink-0 rounded-full border px-2.5 text-[13px] whitespace-nowrap transition-colors ${
        selected
          ? "border-zinc-900 bg-zinc-900 font-medium text-white"
          : "border-zinc-200 bg-white text-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}
