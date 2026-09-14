"use client";

import { useEffect, useRef } from "react";

import AddressSearch from "@/features/panel/AddressSearch";
import DetailPane from "@/features/panel/DetailPane";
import EmptyState from "@/features/panel/EmptyState";
import NearbyList from "@/features/panel/NearbyList";
import ShelterFilterBar from "@/features/panel/ShelterFilterBar";
import SummaryTable from "@/features/panel/SummaryTable";
import type { GeocodeHit } from "@/lib/address";
import type { ShelterFilter } from "@/lib/filter";
import type { LatLng } from "@/lib/geo";
import { type Origin, originLabel } from "@/lib/origin";
import { MAX_PLACES, type Place } from "@/lib/places";

/**
 * 操作と結果をまとめて置くパネル。狭い画面では下のシート、広い画面では左の柱。
 *
 * **地図に重ねる操作は持たない。** 以前は「場所を決める」が中央のカード・下のバー・
 * 左上のボタンに散っていて、同じ仕事なのに見る場所が毎回変わっていた。
 * ここに集めて、地図には地図の一部（ピン・現在地の印・件数）だけを残す。
 *
 * **この部品は枠だけを持つ。** 中身（災害別の表・近い順・詳細・起点がまだ無いときの
 * 案内）はそれぞれ別のファイルにあり、取得も自分で面倒を見る。
 */
export type PanelView =
  /** 災害8種ぶんの最寄りをまとめた表。拠点の「持ち帰れるもの」 */
  | { state: "summary" }
  | { state: "list" }
  | { state: "detail"; id: string; from: "summary" | "list" };

const TITLES = {
  /** 起点がまだ無いとき */
  start: "場所を決める",
  detail: "施設の詳細",
} as const;

export default function ShelterPanel({
  view,
  filter,
  origin,
  places,
  locateError,
  collapsed,
  onToggleCollapsed,
  onShow,
  onChangeFilter,
  onPickAddress,
  onLocate,
  locating,
  onSelectPlace,
  onRemovePlace,
  removedPlace,
  onUndoRemove,
  undoableOrigin,
  onUndoOrigin,
  onSavePlace,
  saveFull,
  onShare,
  onFocus,
}: {
  view: PanelView;
  filter: ShelterFilter;
  /** 近い順の起点。null なら表と一覧は出せない */
  origin: Origin | null;
  places: Place[];
  locateError: string | null;
  /** 狭い画面で見出しだけに畳んでいるか。地図を広く見たいときのため */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onShow: (state: "summary" | "list") => void;
  onChangeFilter: (next: ShelterFilter) => void;
  onPickAddress: (hit: GeocodeHit) => void;
  /** 現在地を取る。起点がまだ無いときの案内から直接押せるようにするため */
  onLocate: () => void;
  locating: boolean;
  onSelectPlace: (place: Place) => void;
  onRemovePlace: (name: string) => void;
  /** 直前に消した拠点。しばらくは戻せるようにしておく */
  removedPlace: Place | null;
  onUndoRemove: () => void;
  /** 地図を押して起点が移ったときの、戻り先。無ければ null */
  undoableOrigin: Origin | null;
  onUndoOrigin: () => void;
  /** 起点をまだ拠点にしていないときだけ渡す */
  onSavePlace?: () => void;
  /** 保存ボタンが無いのが「上限に達したから」のとき */
  saveFull: boolean;
  onShare: () => void;
  onFocus: (target: LatLng) => void;
}) {
  /** 起点がまだ無いときの案内から、住所の欄に焦点を渡すための参照 */
  const searchRef = useRef<HTMLInputElement>(null);
  /**
   * いま見ている拠点のチップ。**横に流す列なので、画面の外に出たら連れ戻す。**
   * 光っているチップが見えていないと、どこの話をしている画面なのか分からなくなる。
   */
  const currentChipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // block を nearest にしておくこと。縦は別の入れ物が持っていて、ここで動かす話ではない。
    currentChipRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [origin?.name]);
  const reading = origin !== null && view.state !== "detail";
  /** いま見ている場所を拠点にできるか（すでに拠点なら出さない） */
  const showSave = reading && Boolean(onSavePlace);
  /** 送れるものがあるか */
  const showShare = places.length > 0;

  return (
    /*
      狭い画面では下から出すシート、広い画面では左の柱にする。
      スマホは縦が足りないので下から出すのが自然だが、PC で同じことをすると
      地図の高さを最大60%食う。PC は横が余っているので、そちらを使う。
    */
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[65%] flex-col rounded-t-xl border-t border-zinc-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:inset-y-0 md:right-auto md:w-80 md:max-h-none md:rounded-none md:border-t-0 md:border-r md:shadow-[4px_0_16px_rgba(0,0,0,0.06)] lg:w-96">
      {/*
        畳む・開くのつまみ。畳めるのは狭い画面だけなので、広い画面では出さない。

        **隅の「▼」1文字から、上端中央のつまみに変えた。** 下から出るシートの
        つまみはこの位置にあるものとして触られるし、記号1つぶんしかなかった的が
        シートの幅いっぱいになる。畳んだときは下の見出し行も押せるようにして、
        **開く側の的をさらに大きく取る**（畳んだシートを開けないのがいちばん困る）。
      */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "パネルを開く" : "パネルを畳む"}
        className="flex shrink-0 justify-center py-2 md:hidden"
      >
        <span
          aria-hidden="true"
          className="h-1 w-10 rounded-full bg-zinc-300"
        />
      </button>

      {/*
        住所の検索は**どの画面でも一番上**に置く。地図アプリの検索欄が上にあるのは
        慣習でもあるし、場所を決め直すのに別の画面を経由させる必要がなくなる。
        地図に重ねないのは、操作をパネルに集める整理に合わせたため。
      */}
      <div className="shrink-0 border-b border-zinc-100 px-4 pb-2 md:pt-2">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={false}
            className="flex w-full items-center gap-2 py-1.5 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">
              {origin ? originLabel(origin) : TITLES.start}
            </span>
            <span className="shrink-0 text-xs text-zinc-500">開く</span>
          </button>
        ) : (
          <>
            <AddressSearch onPick={onPickAddress} inputRef={searchRef} />
            {locateError && (
              <p className="mt-1 text-xs text-zinc-500">{locateError}</p>
            )}
          </>
        )}
      </div>

      {/*
        保存した拠点は常設の行にする。
        以前は「場所を決める」という画面を経由しないと切り替えられなかったが、
        住所は上の検索、現在地は地図右上のボタン、地図は押すだけ、と
        他の決め方がすべて常設になったので、この一覧だけのために画面を1つ持つ理由が無い。

        **折り返さず、横に流す。** チップは2文字の名前で 76px、いま見ている拠点には
        ✕ が付いて 116px。プリセットは4つ（自宅・職場・実家・学校）あるので、
        **4件目からどの画面幅でも2行**になり、行が 57px から 102px に膨らんでいた。
        パネルの縦は取り合いになっていて（絞り込みとタブを1行にまとめたのと同じ話）、
        拠点を足しただけで中身が 45px 削れる作りは持ちたくない。

        横に流せば**件数に関わらず 57px で固定**できる。上限は5件で名前も短いので、
        外に出るのはせいぜい1つ。Material の scrollable chip set と同じ扱いで、
        端で切れているチップ自体が「まだ続く」の合図になる。
        スクロールバーは消す（出すと行がそのぶん厚くなって、元も子もない）。
      */}
      {!collapsed && places.length > 0 && (
        <div className="no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-zinc-100 px-4 py-2">
          {places.map((place) => {
            const current = origin?.name === place.name;
            return (
              <span key={place.name} className="flex shrink-0 items-center">
                <button
                  type="button"
                  ref={current ? currentChipRef : undefined}
                  onClick={() => onSelectPlace(place)}
                  className={`min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    current
                      ? "border-amber-300 bg-amber-50 text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  ★ {place.name}
                </button>
                {/*
                  **消す口は、いま見ている拠点にだけ出す。**
                  以前は全部の★の隣に常設していたので、いちばんよく押す操作
                  （拠点の切り替え）のすぐ隣に、壊す操作が同じ大きさで並んでいた。
                  切り替えは何度でもやり直せるが、削除はそうではない（戻せるのは
                  帯が出ているあいだだけ）。**押し分けの難易度を、結果の重さに合わせる。**
                  ほかの拠点を消すときは、いったんその拠点に切り替えてから。
                */}
                {current && (
                  <button
                    type="button"
                    aria-label={`${place.name}を削除`}
                    onClick={() => onRemovePlace(place.name)}
                    className="flex size-10 shrink-0 items-center justify-center rounded text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    ✕
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/*
        消した直後は戻せるようにする。**✕ ですぐ消えて終わりにしない。**
        拠点は自分で入力して作ったもので、消すと URL も書き換わるため、
        取り違えて押したときに戻す手立てが無いと痛い。
        確認ダイアログで毎回止めるより、押しやすいまま戻せるほうが軽い。
      */}
      {removedPlace && !collapsed && (
        <UndoBar onUndo={onUndoRemove}>
          「{removedPlace.name}」を削除しました
        </UndoBar>
      )}

      {/*
        地図を押して起点が移ったときの戻り口。**畳んでいても出す。**
        拠点を消したときの帯（上）は畳んだら引っ込めているが、こちらは事情が逆で、
        地図を押し間違えるのは**畳んで地図を広く見ているとき**がいちばん多い。
        出す場所を揃えるより、要るときに出ているほうを取る。
      */}
      {undoableOrigin && (
        <UndoBar onUndo={onUndoOrigin}>
          起点を
          {undoableOrigin.name
            ? `「${undoableOrigin.name}」`
            : originLabel(undoableOrigin)}
          から移しました
        </UndoBar>
      )}

      {/*
        起点の名前だけの行は持たない。拠点なら上の★が光っているし、
        地図にはピンが立っていて、どこの話かはそれで足りる。
        1行まるごと使うほどの情報ではなかった。
      */}
      {view.state === "detail" && !collapsed && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-1">
          <button
            type="button"
            onClick={() => onShow(view.from)}
            className="-ml-2 flex min-h-10 items-center rounded px-2 text-sm text-zinc-500 hover:text-zinc-900"
          >
            {/* 起点がまだ無いときの戻り先は表でも一覧でもなく、場所を決める案内。 */}
            ← {!origin ? "戻る" : view.from === "summary" ? "表" : "一覧"}
          </button>
          <h2 className="text-sm font-semibold text-zinc-700">
            {TITLES.detail}
          </h2>
        </div>
      )}

      {/*
        **見方の切り替えと絞り込みは、1行を分け合う。**
        もとは別々の行で、合わせて 156px（下のシートの 42%）を固定で使っていた。
        住所の欄・拠点の★・下段の保存/送るを足すと、iPhone SE 相当では
        **中身に残るのが 40px 弱**しかなく、答えを読む場所が操作に食われていた。
        左にセグメント・右に絞り込み、はこの種の画面で広く使われている並び。

        見方の切り替えは、災害別の表がこのアプリの答えで、近い順はその裏取り。
        どちらかに片寄せると片方が行き止まりになるので、両方を出し続ける。
        起点がまだ無いあいだは出す中身が無いので、絞り込みだけが残る
        （絞り込みは起点と関係なく地図に効くので、こちらは常に置く）。
      */}
      {!collapsed && (
        <ShelterFilterBar value={filter} onChange={onChangeFilter}>
          {reading && (
            <>
              <Tab
                active={view.state === "summary"}
                onClick={() => onShow("summary")}
              >
                災害別
              </Tab>
              <Tab active={view.state === "list"} onClick={() => onShow("list")}>
                近い順
              </Tab>
            </>
          )}
        </ShelterFilterBar>
      )}

      {/* 畳んだときは見出しだけ残す。広い画面では畳まない。 */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
          collapsed ? "hidden md:block" : ""
        }`}
      >
        {/*
          **詳細は起点が無くても出す。** 開いた直後の例の地図にも点は出ていて、
          押されるのはたいていそこから。起点が決まるまで出さない作りにしていたので、
          初めて来た人が点を押すと、選択の輪だけが出て中身が出なかった。
        */}
        {!origin && view.state !== "detail" && (
          <EmptyState
            onLocate={onLocate}
            locating={locating}
            onEnterAddress={() => searchRef.current?.focus()}
          />
        )}
        {origin && view.state === "summary" && (
          <SummaryTable origin={origin} filter={filter} onFocus={onFocus} />
        )}
        {origin && view.state === "list" && (
          <NearbyList origin={origin} filter={filter} onFocus={onFocus} />
        )}
        {view.state === "detail" && <DetailPane id={view.id} />}
      </div>

      {/* 保存ボタンが出ない理由のうち、上限のほうは言わないと分からない。 */}
      {!collapsed && saveFull && (
        <p className="shrink-0 border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs leading-relaxed text-zinc-600">
          拠点は{MAX_PLACES}つまでです。ここを拠点にするには、上の★から
          要らないものを消してください。
        </p>
      )}

      {/*
        持ち帰る導線はパネルの最下段に固定する。
        このアプリの答えは「調べた結果が手元に残ること」なので、スクロールや
        画面の切り替えで見えなくなる場所には置かない。

        **保存と共有は両方出す。** 1つの枠で入れ替えていたが、
        「保存したい」と「送りたい」は同時に成り立つ場面のほうが多く、
        入れ替わりに気づけない問題もあった。縦に積むと下段が厚くなるので1行を分け合う。
        色と記号でも分ける（保存は黄＋★＝拠点の色、送るは黒＋QR＝主要動作の色）。

        出さない条件は2つだけ。**保存**はいま見ている場所がすでに拠点のとき、
        **送る**は拠点が1つも無いとき（送るものが無い）。
      */}
      {!collapsed && (showSave || showShare) && (
        <div className="flex shrink-0">
          {showSave && (
            <button
              type="button"
              onClick={onSavePlace}
              className="flex flex-1 flex-col items-center border-t border-amber-300 bg-amber-400 px-4 py-3 text-center transition-colors hover:bg-amber-300"
            >
              <span className="text-sm font-semibold text-zinc-900">
                ★ 拠点として保存
              </span>
              {/* 保存の value は、まだ1つも持っていない人にだけ要る。 */}
              {places.length === 0 && (
                <span className="text-xs leading-snug text-zinc-800">
                  次から1タップで開けて、家族に送ったり紙に出したりできます
                </span>
              )}
            </button>
          )}
          {showShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex flex-1 items-center justify-center gap-2 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              <QrIcon />
              送る・紙に出す
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 取り消せることを知らせる帯。
 *
 * 拠点の削除と、地図を押して起点が移ったときの2か所で出す。どちらも
 * 「押すつもりが無くても起きうる操作の結果」で、見た目と的の大きさをそろえる。
 */
function UndoBar({
  onUndo,
  children,
}: {
  onUndo: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-900 px-4 py-1.5 text-sm text-white">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <button
        type="button"
        onClick={onUndo}
        className="flex min-h-9 shrink-0 items-center rounded-lg border border-white/30 px-3 text-xs font-medium hover:bg-white/10"
      >
        元に戻す
      </button>
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      /*
        **押して切り替わるものは、指で押せる大きさにする。**
        11px・py-1 で実測 24px しかなく、地図右上の現在地ボタンを 40px に上げた
        ときの基準（記号だけ・小さすぎる的をやめる）と食い違っていた。
        いちど 36px に上げたが、**基準そのものが主流より低かった**ので 40px に揃えた
        （iOS は 44、Material は 48 が最小。パネル内のチップ類も同じ 40px に寄せてある）。
      */
      className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "border border-zinc-200 text-zinc-500 hover:text-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

/** QR コードの記号。細部は読めなくてよく、四隅の目印で「QR だ」と分かればいい。 */
function QrIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M1 1h5v5H1V1zm1.5 1.5v2h2v-2h-2z" />
      <path d="M10 1h5v5h-5V1zm1.5 1.5v2h2v-2h-2z" />
      <path d="M1 10h5v5H1v-5zm1.5 1.5v2h2v-2h-2z" />
      <path d="M8.5 8.5H10V10H8.5V8.5zM11.5 8.5H13V10h-1.5V8.5zM13.5 10H15v1.5h-1.5V10zM8.5 11.5H10V13H8.5v-1.5zM11 11.5h1.5V13H11v-1.5zM13.5 13H15v1.5h-1.5V13zM8.5 14H10v1H8.5v-1zM11 14h1.5v1H11v-1z" />
    </svg>
  );
}
