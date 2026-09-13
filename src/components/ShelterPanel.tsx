"use client";

import { useEffect, useRef, useState } from "react";

import AddressSearch from "@/components/AddressSearch";
import ShelterDetailView from "@/components/ShelterDetailView";
import ShelterFilterBar from "@/components/ShelterFilterBar";
import { disasterLabel, encodeDisasters } from "@/lib/disasters";
import { filterBadges } from "@/lib/filter-view";
import { roundCoord } from "@/lib/grid";
import { formatDistance } from "@/lib/format";
import type { GeocodeHit } from "@/lib/geocode";
import { kindOf } from "@/lib/kinds";
import type { LatLng, NearbyResult } from "@/lib/nearby";
import type { PlaceSummary } from "@/lib/place-summary";
import { MAX_PLACES, type Place } from "@/lib/places";
import type { PlaceDetail } from "@/lib/shelter-detail";
import type { ShelterFilter } from "@/lib/shelters";
import {
  groupSummaryRows,
  groupTitle,
  isFar,
  NEARBY_LIMIT_M,
  type SummaryGroup,
} from "@/lib/summary-view";

/**
 * 操作と結果をまとめて置くパネル。狭い画面では下のシート、広い画面では左の柱。
 *
 * **地図に重ねる操作は持たない。** 以前は「場所を決める」が中央のカード・下のバー・
 * 左上のボタンに散っていて、同じ仕事なのに見る場所が毎回変わっていた。
 * ここに集めて、地図には地図の一部（ピン・現在地の印・件数）だけを残す。
 */
export type PanelView =
  /** 災害8種ぶんの最寄りをまとめた表。拠点の「持ち帰れるもの」 */
  | { state: "summary" }
  | { state: "list" }
  | { state: "detail"; id: string; from: "summary" | "list" };

/**
 * 近い順の起点。現在地ボタンで取ったもの（gps）・地図や住所で指したもの（picked）・
 * 保存した拠点（saved）は意味が違う。「現在地から近い順」と言い切れるのは
 * 最初のものだけなので、座標だけでなく出どころも一緒に持ち回す。
 */
export type Origin = LatLng & {
  source: "gps" | "picked" | "saved";
  /** 拠点として保存されているときの名前 */
  name?: string;
};

/** 見出しに出す起点の呼び名。拠点なら、その名前で呼ぶ。 */
function originLabel(origin: Origin | null): string {
  if (origin?.name) return origin.name;
  return origin?.source === "picked" ? "指した地点" : "現在地";
}

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
        住所の検索は**どの画面でも一番上**に置く。地図アプリの検索欄が上にあるのは
        慣習でもあるし、場所を決め直すのに別の画面を経由させる必要がなくなる。
        地図に重ねないのは、操作をパネルに集める整理に合わせたため。
      */}
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

      <div className="shrink-0 border-b border-zinc-100 px-3 pb-2 md:pt-2">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={false}
            className="flex w-full items-center gap-2 py-1.5 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">
              {origin ? originLabel(origin) : TITLES.start}
            </span>
            <span className="shrink-0 text-[11px] text-zinc-500">開く</span>
          </button>
        ) : (
          <>
            <AddressSearch onPick={onPickAddress} inputRef={searchRef} />
            {locateError && (
              <p className="mt-1 text-[11px] text-zinc-500">{locateError}</p>
            )}
          </>
        )}
      </div>

      {/*
        保存した拠点は常設の行にする。
        以前は「場所を決める」という画面を経由しないと切り替えられなかったが、
        住所は上の検索、現在地は地図右上のボタン、地図は押すだけ、と
        他の決め方がすべて常設になったので、この一覧だけのために画面を1つ持つ理由が無い。
      */}
      {!collapsed && places.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-100 px-3 py-2">
          {places.map((place) => {
            const current = origin?.name === place.name;
            return (
              <span key={place.name} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onSelectPlace(place)}
                  className={`min-h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
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
                    className="flex size-8 shrink-0 items-center justify-center rounded text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
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
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-900 px-3 py-2 text-xs text-white">
          <span className="min-w-0 flex-1 truncate">
            「{removedPlace.name}」を削除しました
          </span>
          <button
            type="button"
            onClick={onUndoRemove}
            className="shrink-0 rounded border border-white/30 px-2 py-1 text-[11px] font-medium hover:bg-white/10"
          >
            元に戻す
          </button>
        </div>
      )}

      {/*
        地図を押して起点が移ったときの戻り口。**畳んでいても出す。**
        拠点を消したときの帯（上）は畳んだら引っ込めているが、こちらは事情が逆で、
        地図を押し間違えるのは**畳んで地図を広く見ているとき**がいちばん多い。
        出す場所を揃えるより、要るときに出ているほうを取る。
      */}
      {undoableOrigin && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-900 px-3 py-2 text-xs text-white">
          <span className="min-w-0 flex-1 truncate">
            起点を
            {undoableOrigin.name
              ? `「${undoableOrigin.name}」`
              : originLabel(undoableOrigin)}
            から移しました
          </span>
          <button
            type="button"
            onClick={onUndoOrigin}
            className="shrink-0 rounded border border-white/30 px-2 py-1 text-[11px] font-medium hover:bg-white/10"
          >
            元に戻す
          </button>
        </div>
      )}

      {/*
        起点の名前だけの行は持たない。拠点なら上の★が光っているし、
        地図にはピンが立っていて、どこの話かはそれで足りる。
        1行まるごと使うほどの情報ではなかった。
      */}
      {view.state === "detail" && !collapsed && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-3 py-1.5">
          <button
            type="button"
            onClick={() => onShow(view.from)}
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900"
          >
            {/* 起点がまだ無いときの戻り先は表でも一覧でもなく、場所を決める案内。 */}
            ← {!origin ? "戻る" : view.from === "summary" ? "表" : "一覧"}
          </button>
          <h2 className="text-xs font-semibold text-zinc-700">
            {TITLES.detail}
          </h2>
        </div>
      )}

      {/* 絞り込みは1行に畳んで、ここに置く（地図の上から移した）。 */}
      {!collapsed && <ShelterFilterBar value={filter} onChange={onChangeFilter} />}

      {/*
        見方の切り替え。災害別の表がこのアプリの答えで、近い順はその裏取り。
        どちらかに片寄せると片方が行き止まりになる。
      */}
      {reading && !collapsed && (
        <div className="flex shrink-0 items-center gap-1 border-b border-zinc-100 px-3 py-1.5">
          <Tab
            active={view.state === "summary"}
            onClick={() => onShow("summary")}
          >
            災害別
          </Tab>
          <Tab active={view.state === "list"} onClick={() => onShow("list")}>
            近い順
          </Tab>
        </div>
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
          <SummaryTable
            key={originKey(origin)}
            origin={origin}
            filter={filter}
            onFocus={onFocus}
          />
        )}
        {origin && view.state === "list" && (
          <NearbyList
            key={nearbyKey(origin, filter)}
            origin={origin}
            filter={filter}
            onFocus={onFocus}
          />
        )}
        {view.state === "detail" && <DetailPane key={view.id} id={view.id} />}
      </div>

      {/* 保存ボタンが出ない理由のうち、上限のほうは言わないと分からない。 */}
      {!collapsed && saveFull && (
        <p className="shrink-0 border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
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
              className="flex flex-1 flex-col items-center border-t border-amber-300 bg-amber-400 px-3 py-2.5 text-center transition-colors hover:bg-amber-300"
            >
              <span className="text-sm font-semibold text-zinc-900">
                ★ 拠点として保存
              </span>
              {/* 保存の value は、まだ1つも持っていない人にだけ要る。 */}
              {places.length === 0 && (
                <span className="text-[11px] leading-snug text-zinc-800">
                  次から1タップで開けて、家族に送ったり紙に出したりできます
                </span>
              )}
            </button>
          )}
          {showShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex flex-1 items-center justify-center gap-2 bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
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
function EmptyState({
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
      */
      className={`min-h-9 rounded-full px-3 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "border border-zinc-200 text-zinc-500 hover:text-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 「8種の災害 × それぞれの最寄り」の表。
 *
 * このアプリの主張1（避難場所は災害の種類ごとに分かれている）を、
 * **1つの拠点について一度に**見せる。地図で1件ずつ確かめるのと違い、
 * ここだけが持ち帰れる形になる（.local/PLAN.md 壁4）。
 * 絞り込みは効かせない。8種すべてが並ぶこと自体が答えなので。
 */
function SummaryTable({
  origin,
  filter,
  onFocus,
}: {
  origin: Origin | null;
  /** 表には効かないが、効いていないことを言う必要があるかの判断に使う */
  filter: ShelterFilter;
  onFocus: (target: LatLng) => void;
}) {
  const [summary, setSummary] = useState<PlaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
    開いた行はその場で広げる。詳細を別の画面にすると、
    「押す → 戻る → 次を押す」の往復になって、見比べるほど手間が増える。
  */
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!origin) return;
    const controller = new AbortController();

    (async () => {
      try {
        // 座標は丸めてから投げる。同じ拠点・同じ現在地が同じ URL に落ちて、
        // CDN とブラウザのキャッシュに乗る（lib/grid.ts）。
        const res = await fetch(
          `/api/shelters/summary?lat=${roundCoord(origin.lat)}&lng=${roundCoord(origin.lng)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
        setSummary(await res.json());
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    })();

    return () => controller.abort();
  }, [origin]);

  if (!origin) {
    return <Message>起点が決まっていません。</Message>;
  }
  if (error) return <Message>{error}</Message>;
  if (!summary) return <Message>調べています…</Message>;

  const groups = groupSummaryRows(summary.rows);
  /** 「近くにありません」を1行でも出したか。出したときだけ、その意味を断る。 */
  const explained = groups.some((group) => group.far || !group.item);

  return (
    <>
      {/*
        絞り込みバーはこの表の上にあるが、表はそれを見ない（8種すべてが並ぶこと
        自体が答えなので）。押しても表が動かない理由を、押す人の目の高さで言う。

        **ただし、絞り込んでいるときだけ言う。** 既定は絞り込みなしなので、
        常設すると**誰も食い違っていない場面で、全員がこの2行を読まされる**。
        既定の初回表示でいちばん見てほしいのは下の表のほうで、その上に
        断り書きを置く理由はない。食い違いが起きた人にだけ、その場で言う。
      */}
      {filterBadges(filter).length > 0 && (
        <p className="border-b border-zinc-100 px-3 py-1.5 text-[11px] leading-relaxed text-zinc-500">
          絞り込んでいても、この表は8種すべてを出します
          （絞り込みは地図と「近い順」に効きます）。
        </p>
      )}
      {/*
        **8行ではなく、行き先の数だけ並ぶ。** 同じ施設に落ちた災害は1行に束ねる
        （lib/summary-view.ts）。上から近い順なので、読み始めた行がそのまま答えになり、
        「近くにありません」は下にまとまる。
      */}
      <ul className="divide-y divide-zinc-100">
        {groups.map((group) => (
          <li key={group.item?.id ?? "missing"}>
            <SummaryGroupView
              title={groupTitle(group)}
              group={group}
              open={Boolean(group.item) && group.item?.id === openId}
              onToggle={setOpenId}
              onFocus={onFocus}
            />
          </li>
        ))}
      </ul>

      {/*
        指定避難所は災害種別を持たないので、8種の表に混ぜない。
        混ぜると「この災害で使える避難所」と読まれる。
      */}
      <div className="border-t-4 border-zinc-100">
        <p className="px-3 pt-2 text-[11px] text-zinc-500">
          災害がおさまったあと、生活する場所（{kindOf("SHELTER").label}）
        </p>
        <SummaryGroupView
          // 上の1行が名乗っているので、行の見出しは要らない。
          title={null}
          group={{
            disasters: [],
            item: summary.shelter,
            far: summary.shelter ? isFar(summary.shelter) : false,
          }}
          open={Boolean(summary.shelter) && summary.shelter?.id === openId}
          onToggle={setOpenId}
          onFocus={onFocus}
        />
      </div>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        半径{Math.round(summary.radiusM / 1000)}km まで探しました。
        距離は直線距離で、実際の道のりではありません。
        {explained &&
          `「近くにありません」は、${NEARBY_LIMIT_M / 1000}km 以内に、その災害で使える指定が無いという意味です。`}
      </p>
    </>
  );
}

/**
 * 表の1行。**「見つかった／見つからない」ではなく「逃げ先になる／ならない」で分ける。**
 *
 * 半径のはしごは 256km まで伸びるので、その災害の指定が自分の市町村に無いと、
 * 遠くの市町村の指定が最寄りとして返ってくる。それを 500m の小学校と同じ書式で並べると、
 * 表が答えの顔をしたまま嘘をつく。遠いものは名前を主役から降ろし、
 * 「近くにありません」と言い切ったうえで、どこにあるかだけ添える（lib/summary-view.ts）。
 */
function SummaryGroupView({
  title,
  group,
  open,
  onToggle,
  onFocus,
}: {
  /** 行の見出し。指定避難所の行のように、上の見出しで足りるときは null */
  title: string | null;
  group: SummaryGroup;
  open: boolean;
  onToggle: (id: string | null) => void;
  onFocus: (target: LatLng) => void;
}) {
  const { item, far } = group;
  const heading = title && (
    <span className="block text-xs font-semibold text-zinc-900">{title}</span>
  );

  // 押す先が無いので、ボタンにしない。
  if (!item) {
    return (
      <div className="px-3 py-2.5">
        {heading}
        <p className={`flex items-center gap-1.5 ${title ? "mt-1" : ""}`}>
          <MissingDot />
          <span className="text-sm font-semibold text-zinc-900">
            近くにありません
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
          探した範囲に、その災害で使える指定がありませんでした。
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          onFocus(item);
          onToggle(open ? null : item.id);
        }}
        className={`block w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${
          open ? "bg-zinc-50" : ""
        }`}
      >
        {heading}
        <span className={`flex items-center gap-1.5 ${title ? "mt-1" : ""}`}>
          {far ? (
            <MissingDot />
          ) : (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: kindOf(item.kind).color }}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
            {far ? "近くにありません" : item.name}
          </span>
          {/* 遠い行の距離は答えの顔をさせない。下の1行に回す。 */}
          {!far && (
            <span className="shrink-0 text-xs font-semibold text-zinc-900 tabular-nums">
              {formatDistance(item.distanceM)}
            </span>
          )}
        </span>
        <span
          className={`mt-0.5 block truncate text-xs ${
            far ? "text-zinc-600" : "text-zinc-500"
          }`}
        >
          {far
            ? `最寄りは${formatDistance(item.distanceM)}先の${item.name}`
            : item.address}
        </span>
      </button>
      {open && <InlineDetail id={item.id} />}
    </>
  );
}

/**
 * 逃げ先が無い行の印。避難場所の点（塗りつぶしの丸）と同じ位置・同じ大きさの
 * 輪郭だけの丸にして、「ここに入るものが無い」ことを列の中で見せる。
 */
function MissingDot() {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full border border-zinc-400"
    />
  );
}

function NearbyList({
  origin,
  filter,
  onFocus,
}: {
  origin: Origin | null;
  filter: ShelterFilter;
  onFocus: (target: LatLng) => void;
}) {
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 表と同じく、開いた行はその場で広げる。
  const [openId, setOpenId] = useState<string | null>(null);

  // 絞り込みを変えたら取り直す。「この災害で使える最寄り」が変わるのが要点なので、
  // 一覧を開いたまま災害種別を切り替えられるようにしてある。
  useEffect(() => {
    if (!origin) return;
    const controller = new AbortController();

    const query = new URLSearchParams({
      // 表と同じく丸めてから投げる（lib/grid.ts）。11m の差は最寄りの順位を変えない。
      lat: String(roundCoord(origin.lat)),
      lng: String(roundCoord(origin.lng)),
      kinds: filter.kinds.join(","),
    });
    // 並びは正規化済み。地図側と同じ形にして、同じ URL に落ちるようにする。
    if (filter.disasters.length > 0) {
      query.set("disaster", encodeDisasters(filter.disasters));
    }

    (async () => {
      try {
        const res = await fetch(`/api/shelters/nearby?${query}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
        setResult(await res.json());
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    })();

    return () => controller.abort();
  }, [origin, filter]);

  if (!origin) {
    return (
      <Message>
        起点が決まっていません。現在地を取るか、地図から地点を選んでください。
      </Message>
    );
  }
  if (error) return <Message>{error}</Message>;
  if (!result) return <Message>探しています…</Message>;
  if (result.items.length === 0) {
    return (
      <Message>
        半径{Math.round(result.radiusM / 1000)}km 以内に、条件に合う場所が
        見つかりませんでした。
      </Message>
    );
  }

  return (
    <>
      <ul className="divide-y divide-zinc-100">
        {result.items.map((item) => (
          <li key={item.id}>
            {/*
              **災害別の表と同じ組みにする。** 以前はここだけ距離が左端にあり、
              タブを行き来するたびに同じ数字を逆の端で探すことになっていた。
              近い順は距離を縦に読む一覧なので左端にも理はあるが、
              2つの面を往復する作りである以上、そろっているほうが効く。
            */}
            <button
              type="button"
              aria-expanded={item.id === openId}
              onClick={() => {
                onFocus(item);
                setOpenId(item.id === openId ? null : item.id);
              }}
              className={`block w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${
                item.id === openId ? "bg-zinc-50" : ""
              }`}
            >
              <span className="flex items-center gap-1.5">
                {/*
                  同じ場所に両方の指定があるときは、地図の二色の点と同じ見た目
                  （橙の芯＋青いリング）にする。色は増やさない。
                */}
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: kindOf(item.kind).color,
                    boxShadow: item.alsoKind
                      ? `0 0 0 2px ${kindOf(item.alsoKind).color}`
                      : undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
                  {item.name}
                </span>
                {/*
                  記号だけにしない。二色の点は凡例を知らないと読めないので、
                  もう一方の指定があることは文字でも書く。
                */}
                {item.alsoKind && (
                  <span className="shrink-0 rounded-full border border-zinc-300 px-1.5 text-[10px] text-zinc-600">
                    {kindOf(item.alsoKind).shortLabel}も
                  </span>
                )}
                <span className="shrink-0 text-xs font-semibold text-zinc-900 tabular-nums">
                  {formatDistance(item.distanceM)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">
                {item.disasters === null
                  ? "災害種別の指定なし"
                  : item.disasters.map((d) => disasterLabel(d)).join("・")}
              </span>
            </button>
            {item.id === openId && <InlineDetail id={item.id} />}
          </li>
        ))}
      </ul>
      <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        半径{Math.round(result.radiusM / 1000)}km まで探しました
        {result.exhausted && "（これ以上は見つかりませんでした）"}。
        距離は直線距離で、実際の道のりではありません。
      </p>
    </>
  );
}

/** 一覧・表の行の中に出す詳細。画面を切り替えずに、そのまま次の行へ移れる。 */
function InlineDetail({ id }: { id: string }) {
  return (
    <div className="border-y border-zinc-100 bg-zinc-50/70 px-3 py-2.5">
      <DetailPane id={id} />
    </div>
  );
}

function DetailPane({ id }: { id: string }) {
  const [detail, setDetail] = useState<PlaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 地図の点は転送量のために名前と種別しか持っていないので、押されてから取る。
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/shelters/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
        setDetail(await res.json());
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    })();

    return () => controller.abort();
  }, [id]);

  if (error) return <Message>{error}</Message>;
  if (!detail) return <Message>読み込み中…</Message>;

  return (
    <div className="px-3 py-3">
      <ShelterDetailView detail={detail} />
    </div>
  );
}

/** 起点だけで作り直す単位。表は絞り込みを見ないので、こちらは起点だけ。 */
function originKey(origin: Origin | null): string {
  return `${origin?.lat}/${origin?.lng}`;
}

/**
 * 一覧を作り直す単位。起点か絞り込みが変わったら別物として扱い、
 * key で作り直して「探しています…」から始める。
 */
function nearbyKey(origin: Origin | null, filter: ShelterFilter): string {
  return [
    origin?.lat,
    origin?.lng,
    filter.kinds.join("+"),
    filter.disasters.join("+"),
  ].join("/");
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs leading-relaxed text-zinc-500">
      {children}
    </p>
  );
}
