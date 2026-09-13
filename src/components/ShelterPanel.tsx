"use client";

import { useEffect, useState } from "react";

import ShelterDetailView from "@/components/ShelterDetailView";
import { disasterLabel } from "@/lib/disasters";
import { formatDistance } from "@/lib/format";
import { kindOf } from "@/lib/kinds";
import type { LatLng, NearbyItem, NearbyResult } from "@/lib/nearby";
import type { PlaceSummary } from "@/lib/place-summary";
import type { ShelterDetail } from "@/lib/shelter-detail";
import type { ShelterFilter } from "@/lib/shelters";

/**
 * 一覧と詳細を出す下段のパネル。
 *
 * 詳細を地図のポップアップではなくここに出しているのは、スマホで指と吹き出しが
 * 重なるのを避けるためと、一覧の行と詳細で同じ表示を使い回せるため。
 */
export type PanelState =
  | { state: "closed" }
  /** 災害8種ぶんの最寄りをまとめた表。拠点の「持ち帰れるもの」 */
  | { state: "summary" }
  | { state: "list" }
  | { state: "detail"; id: string; from: "summary" | "list" };

/**
 * 近い順の起点。現在地ボタンで取ったもの（gps）・地図で指したもの（picked）・
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

export default function ShelterPanel({
  panel,
  filter,
  origin,
  onSavePlace,
  onClose,
  onSelect,
  onShow,
  onFocus,
}: {
  panel: PanelState;
  filter: ShelterFilter;
  /** 近い順の起点。null なら一覧は出せない */
  origin: Origin | null;
  /** 起点をまだ拠点にしていないときだけ渡す */
  onSavePlace?: () => void;
  onClose: () => void;
  onSelect: (item: NearbyItem) => void;
  /** 表・一覧の切り替えと、詳細からの戻り */
  onShow: (state: "summary" | "list") => void;
  onFocus: (target: LatLng) => void;
}) {
  if (panel.state === "closed") return null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[60%] flex-col rounded-t-xl border-t border-zinc-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-3 py-2">
        {panel.state === "detail" ? (
          <>
            <button
              type="button"
              onClick={() => onShow(panel.from)}
              className="rounded px-1 text-xs text-zinc-500 hover:text-zinc-900"
            >
              ← {panel.from === "summary" ? "表" : "一覧"}
            </button>
            <h2 className="text-xs font-semibold text-zinc-700">施設の詳細</h2>
          </>
        ) : (
          <>
            {/*
              2つの見方を並べて持つ。災害別の表がこのアプリの答えで、
              近い順はその裏取り。どちらかに片寄せると片方が行き止まりになる。
            */}
            <div className="flex shrink-0 gap-1">
              <Tab
                active={panel.state === "summary"}
                onClick={() => onShow("summary")}
              >
                災害別
              </Tab>
              <Tab
                active={panel.state === "list"}
                onClick={() => onShow("list")}
              >
                近い順
              </Tab>
            </div>
            <h2 className="min-w-0 truncate text-xs font-semibold text-zinc-700">
              {originLabel(origin)}から
            </h2>
          </>
        )}
        {/*
          保存はここに置く。調べ終わった直後が、いちばん「残しておこう」と
          思える場所なので（PLAN の壁4「見て知っても何も残らない」への入口）。
        */}
        {panel.state !== "detail" && onSavePlace && (
          <button
            type="button"
            onClick={onSavePlace}
            className="shrink-0 rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            拠点に保存
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="ml-auto rounded px-2 text-zinc-400 hover:text-zinc-900"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {panel.state === "summary" && (
          <SummaryTable
            key={originKey(origin)}
            origin={origin}
            onSelect={onSelect}
            onFocus={onFocus}
          />
        )}
        {panel.state === "list" && (
          <NearbyList
            key={nearbyKey(origin, filter)}
            origin={origin}
            filter={filter}
            onSelect={onSelect}
            onFocus={onFocus}
          />
        )}
        {panel.state === "detail" && <DetailPane key={panel.id} id={panel.id} />}
      </div>
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
  onSelect,
  onFocus,
}: {
  origin: Origin | null;
  onSelect: (item: NearbyItem) => void;
  onFocus: (target: LatLng) => void;
}) {
  const [summary, setSummary] = useState<PlaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <ul className="divide-y divide-zinc-100">
        {summary.rows.map((row) => (
          <li key={row.disaster}>
            <SummaryRowView
              label={disasterLabel(row.disaster)}
              item={row.nearest}
              onSelect={onSelect}
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
          onSelect={onSelect}
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
  onSelect,
  onFocus,
}: {
  label: string;
  item: NearbyItem | null;
  onSelect: (item: NearbyItem) => void;
  onFocus: (target: LatLng) => void;
}) {
  if (!item) {
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="w-16 shrink-0 text-xs font-semibold text-zinc-900">
          {label}
        </span>
        <span className="text-xs text-zinc-400">見つかりませんでした</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onFocus(item);
        onSelect(item);
      }}
      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50"
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
  );
}

function NearbyList({
  origin,
  filter,
  onSelect,
  onFocus,
}: {
  origin: Origin | null;
  filter: ShelterFilter;
  onSelect: (item: NearbyItem) => void;
  onFocus: (target: LatLng) => void;
}) {
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              onClick={() => {
                onFocus(item);
                onSelect(item);
              }}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50"
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
