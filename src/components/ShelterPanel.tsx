"use client";

import { useEffect, useState } from "react";

import AddressSearch from "@/components/AddressSearch";
import ShelterDetailView from "@/components/ShelterDetailView";
import ShelterFilterBar from "@/components/ShelterFilterBar";
import { disasterLabel } from "@/lib/disasters";
import { formatDistance } from "@/lib/format";
import type { GeocodeHit } from "@/lib/geocode";
import { kindOf } from "@/lib/kinds";
import type { LatLng, NearbyItem, NearbyResult } from "@/lib/nearby";
import type { PlaceSummary } from "@/lib/place-summary";
import { MAX_PLACES, type Place } from "@/lib/places";
import type { ShelterDetail } from "@/lib/shelter-detail";
import type { ShelterFilter } from "@/lib/shelters";

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
      <div className="shrink-0 border-b border-zinc-100 px-3 py-2">
        <div className="flex items-center gap-2">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <AddressSearch onPick={onPickAddress} />
            </div>
          )}
          {collapsed && (
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">
              {origin ? originLabel(origin) : TITLES.start}
            </span>
          )}
          {/* 畳めるのは狭い画面だけ。広い画面では柱が常に出ている。 */}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "パネルを開く" : "パネルを畳む"}
            className="shrink-0 rounded px-2 py-1 text-zinc-500 hover:text-zinc-900 md:hidden"
          >
            {collapsed ? "▲" : "▼"}
          </button>
        </div>
        {!collapsed && locateError && (
          <p className="mt-1 text-[11px] text-zinc-500">{locateError}</p>
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
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    current
                      ? "border-amber-300 bg-amber-50 text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  ★ {place.name}
                </button>
                <button
                  type="button"
                  aria-label={`${place.name}を削除`}
                  onClick={() => onRemovePlace(place.name)}
                  /*
                    消す操作。指で押せる大きさ（24px）と、見える濃さにする。
                    元は 16px 角・zinc-300（白地で 1.5:1）で、隣の拠点ボタンと
                    紛れていた。戻せる（下の帯）とはいえ、当たりやすさの話は別。
                  */
                  className="flex size-6 shrink-0 items-center justify-center rounded text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                >
                  ✕
                </button>
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
          <EmptyState hasPlaces={places.length > 0} />
        )}
        {origin && view.state === "summary" && (
          <SummaryTable
            key={originKey(origin)}
            origin={origin}
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

/** 起点がまだ無いときの中身。決め方は3つとも常設なので、ここでは道を示すだけ。 */
function EmptyState({ hasPlaces }: { hasPlaces: boolean }) {
  return (
    <div className="px-3 py-3">
      <p className="text-xs leading-relaxed text-zinc-600">
        いまは<span className="font-medium text-zinc-900">例として東京の地図</span>
        を出しています。調べたい場所を決めると、そこから
        <strong className="font-medium text-zinc-900">
          災害の種類ごとに使える避難場所
        </strong>
        を出します。
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-[11px] leading-relaxed text-zinc-600">
        {hasPlaces && <li>・上の★から、保存した拠点を開く</li>}
        <li>・上の検索に住所を入れる（町丁目まで）</li>
        <li>・地図の右上「現在地」を押す</li>
        <li>・地図を押す（遠いときは押すたびに寄ります）</li>
      </ul>
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
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
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
  onFocus,
}: {
  origin: Origin | null;
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
        const res = await fetch(
          `/api/shelters/summary?lat=${origin.lat}&lng=${origin.lng}`,
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

  return (
    <>
      {/*
        絞り込みバーはこの表の上にあるが、表はそれを見ない（8種すべてが並ぶこと
        自体が答えなので）。押しても表が動かない理由を、押す人の目の高さで言う。
      */}
      <p className="border-b border-zinc-100 px-3 py-1.5 text-[11px] leading-relaxed text-zinc-500">
        この表は絞り込みの対象外です（8種すべてを出します）。上の絞り込みは地図に効きます。
      </p>
      <ul className="divide-y divide-zinc-100">
        {summary.rows.map((row) => (
          <li key={row.disaster}>
            <SummaryRowView
              label={disasterLabel(row.disaster)}
              item={row.nearest}
              open={row.nearest?.id === openId}
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
        <SummaryRowView
          label="最寄り"
          item={summary.shelter}
          open={summary.shelter?.id === openId}
          onToggle={setOpenId}
          onFocus={onFocus}
        />
      </div>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        半径{Math.round(summary.radiusM / 1000)}km まで探しました。
        距離は直線距離で、実際の道のりではありません。
        {summary.incomplete &&
          "見つからなかった災害は、この付近にその災害で使える指定がありません。"}
      </p>
    </>
  );
}

function SummaryRowView({
  label,
  item,
  open,
  onToggle,
  onFocus,
}: {
  label: string;
  item: NearbyItem | null;
  open: boolean;
  onToggle: (id: string | null) => void;
  onFocus: (target: LatLng) => void;
}) {
  if (!item) {
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="w-16 shrink-0 text-xs font-semibold text-zinc-900">
          {label}
        </span>
        <span className="text-xs text-zinc-500">見つかりませんでした</span>
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
        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 ${
          open ? "bg-zinc-50" : ""
        }`}
      >
        <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-zinc-900">
          {label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: kindOf(item.kind).color }}
            />
            <span className="truncate text-sm text-zinc-900">{item.name}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">
            {item.address}
          </span>
        </span>
        <span className="w-12 shrink-0 pt-0.5 text-right text-xs font-semibold text-zinc-900 tabular-nums">
          {formatDistance(item.distanceM)}
        </span>
      </button>
      {open && <InlineDetail id={item.id} />}
    </>
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
      lat: String(origin.lat),
      lng: String(origin.lng),
      kinds: filter.kinds.join(","),
    });
    if (filter.disaster) query.set("disaster", filter.disaster);

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
            <button
              type="button"
              aria-expanded={item.id === openId}
              onClick={() => {
                onFocus(item);
                setOpenId(item.id === openId ? null : item.id);
              }}
              className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 ${
                item.id === openId ? "bg-zinc-50" : ""
              }`}
            >
              <span className="w-12 shrink-0 pt-0.5 text-right text-xs font-semibold text-zinc-900 tabular-nums">
                {formatDistance(item.distanceM)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: kindOf(item.kind).color }}
                  />
                  <span className="truncate text-sm text-zinc-900">
                    {item.name}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-zinc-500">
                  {item.disasters === null
                    ? "災害種別の指定なし"
                    : item.disasters.map((d) => disasterLabel(d)).join("・")}
                </span>
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
  const [detail, setDetail] = useState<ShelterDetail | null>(null);
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
    filter.disaster,
  ].join("/");
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs leading-relaxed text-zinc-500">
      {children}
    </p>
  );
}
