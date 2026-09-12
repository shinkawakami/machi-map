"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import ShelterFilterBar from "@/components/ShelterFilterBar";
import ShelterPanel, { type PanelState } from "@/components/ShelterPanel";
import { kindOf } from "@/lib/kinds";
import type { LatLng } from "@/lib/nearby";
import type { ShelterFilter, SheltersResult } from "@/lib/shelters";

/**
 * 背景地図は地理院タイル（淡色地図）。避難場所の点を載せるので、
 * 情報量の少ない淡色を使う。出典表示は利用規約上の義務なので消さない。
 */
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    gsi: {
      type: "raster",
      tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
      tileSize: 256,
      minzoom: 2,
      // 淡色地図の実体は z17 まで。z18 はオーバーズームで引き伸ばす。
      maxzoom: 17,
      attribution: GSI_ATTRIBUTION,
    },
  },
  layers: [{ id: "gsi", type: "raster", source: "gsi" }],
};

/**
 * 起動時は全国を収める。開いた瞬間に中身が入っていることを優先する。
 * 中心とズームを決め打ちにすると画面幅で端が切れるので、bounds で指定する。
 */
const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [122.9, 24.0],
  [146.0, 45.6],
];
/**
 * 日本の外に出ても意味がないので止める。ただし**大きく取る**こと。
 * maxBounds が表示範囲より狭いと、MapLibre はカメラのほうを黙って動かして
 * 収めにいく。最初これを 110-165°E（55°幅）にしていたら、全国を収めるはずの
 * fitBounds が上書きされて北海道と沖縄が切れた。
 * 「はみ出せる限界」ではなく「どのズームでも表示範囲より広い箱」を書く。
 */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [95, 5],
  [180, 60],
];

// 色は lib/kinds.ts が唯一の出どころ。凡例（フィルタの種別ボタン）と必ずそろえる。
const COLOR_EMERGENCY = kindOf("EMERGENCY").color;
const COLOR_SHELTER = kindOf("SHELTER").color;

/** クラスタの目標セルサイズ（px）。画面幅から横方向の分割数を決める。 */
const CLUSTER_CELL_PX = 80;

const SOURCE_ID = "shelters";
const LAYER_ID = "shelter-points";

/** 現在地と選択中の点。避難場所の点より上に重ねる。 */
const ME_SOURCE_ID = "my-location";
const SELECTED_SOURCE_ID = "selected-shelter";

type Status =
  | { state: "loading" }
  | { state: "ready"; result: SheltersResult }
  | { state: "error"; message: string };

export default function ShelterMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [filter, setFilter] = useState<ShelterFilter>({
    // 開いた瞬間に中身が入っていることを優先する。既定は絞り込みなし。
    kinds: ["EMERGENCY", "SHELTER"],
    disaster: null,
  });

  const [panel, setPanel] = useState<PanelState>({ state: "closed" });
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [selected, setSelected] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // 地図に足したソースへ setData できるようになった時点。
  const [mapReady, setMapReady] = useState(false);

  // load() は地図を作る effect の中で閉じており、filter を直接読むと
  // 絞り込みを変えるたびに地図が作り直される。ref で最新を渡す。
  const filterRef = useRef(filter);
  const loadRef = useRef<(() => void) | null>(null);

  const clearMarkers = useCallback(() => {
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
  }, []);

  useEffect(() => {
    let disposed = false;

    (async () => {
      // maplibre-gl は v6 で ESM の名前付きエクスポートのみになった（default が無い）。
      // useEffect の中で読むことで、サーバー側の描画には一切載せない。
      const {
        AttributionControl,
        Map,
        Marker,
        NavigationControl,
        setWorkerUrl,
      } = await import("maplibre-gl");
      if (disposed || !containerRef.current) return;

      // 既定のワーカー URL は実行時に組み立てられるためバンドラから見えず、
      // Turbopack が出力しないので 404 になる。自前で配ったものを指す。
      // 詳細は scripts/copy-maplibre-worker.mjs。
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      const map = new Map({
        container: containerRef.current,
        style: MAP_STYLE,
        bounds: JAPAN_BOUNDS,
        fitBoundsOptions: { padding: 8 },
        minZoom: 3,
        maxZoom: 18,
        maxBounds: MAX_BOUNDS,
        // 世界を横に繰り返さない。getBounds() が ±180 を超えた値を返さなくなる。
        renderWorldCopies: false,
        attributionControl: false,
      });
      mapRef.current = map;

      if (process.env.NODE_ENV !== "production") {
        // 開発中にコンソールから地図の状態を覗くための口。
        (window as unknown as { __map?: MapLibreMap }).__map = map;
      }

      map.addControl(new AttributionControl({ compact: true }), "bottom-right");
      map.addControl(
        new NavigationControl({ showCompass: false }),
        "top-right",
      );

      const load = async () => {
        const bounds = map.getBounds();
        const bbox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]
          .map((n) => n.toFixed(5))
          .join(",");
        const cells = Math.round(
          map.getContainer().clientWidth / CLUSTER_CELL_PX,
        );
        const { kinds, disaster } = filterRef.current;
        const query = new URLSearchParams({
          bbox,
          cells: String(cells),
          kinds: kinds.join(","),
        });
        if (disaster) query.set("disaster", disaster);

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStatus({ state: "loading" });

        try {
          const res = await fetch(`/api/shelters?${query}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
          const result: SheltersResult = await res.json();
          if (disposed) return;

          clearMarkers();

          const source = map.getSource<GeoJSONSource>(SOURCE_ID);
          if (source) {
            source.setData({
              type: "FeatureCollection",
              features:
                result.mode === "points"
                  ? result.points.map((p) => ({
                      type: "Feature" as const,
                      geometry: {
                        type: "Point" as const,
                        coordinates: [p.lng, p.lat],
                      },
                      properties: { id: p.id, name: p.name, kind: p.kind },
                    }))
                  : [],
            });
          }

          if (result.mode === "clusters") {
            markersRef.current = result.clusters.map((c) => {
              const element = clusterElement(c.count, () => {
                map.easeTo({
                  center: [c.lng, c.lat],
                  zoom: Math.min(map.getZoom() + 2, 18),
                });
              });
              return new Marker({ element })
                .setLngLat([c.lng, c.lat])
                .addTo(map);
            });
          }

          setStatus({ state: "ready", result });
        } catch (error) {
          if (controller.signal.aborted || disposed) return;
          setStatus({
            state: "error",
            message:
              error instanceof Error ? error.message : "読み込みに失敗しました",
          });
        }
      };

      map.on("load", () => {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              3,
              13,
              6,
              18,
              10,
            ],
            "circle-color": [
              "match",
              ["get", "kind"],
              "EMERGENCY",
              COLOR_EMERGENCY,
              COLOR_SHELTER,
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
          },
        });

        // 詳細は吹き出しではなく下段のパネルに出す。スマホで指と吹き出しが
        // 重なるのを避けたいのと、近い順の一覧と表示を使い回せるため。
        map.on("click", LAYER_ID, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const { id } = feature.properties as { id: string };
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          setSelected({ lat, lng });
          setPanel({ state: "detail", id });
        });
        map.on("mouseenter", LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });

        // 現在地と選択中の点。中身は別の effect から setData で入れる。
        for (const id of [ME_SOURCE_ID, SELECTED_SOURCE_ID]) {
          map.addSource(id, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
        }
        map.addLayer({
          id: SELECTED_SOURCE_ID,
          type: "circle",
          source: SELECTED_SOURCE_ID,
          paint: {
            "circle-radius": 11,
            "circle-color": "#ffffff",
            "circle-opacity": 0,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#18181b",
          },
        });
        map.addLayer({
          id: ME_SOURCE_ID,
          type: "circle",
          source: ME_SOURCE_ID,
          paint: {
            "circle-radius": 7,
            "circle-color": "#2563eb",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });
        setMapReady(true);

        // moveend の購読はソースを足した後で始める。
        // 先に発火すると setData の相手がまだ無い。
        map.on("moveend", () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          // 慣性スクロールの途中で何度も投げないよう、止まってから少し待つ。
          timerRef.current = setTimeout(() => void load(), 200);
        });

        loadRef.current = () => void load();
        void load();
      });
    })();

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      clearMarkers();
      loadRef.current = null;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [clearMarkers]);

  // 絞り込みが変わったら取り直す。初回は地図の load がまだなので loadRef が空で、
  // その場合は load 側の初回呼び出しが拾う。
  useEffect(() => {
    filterRef.current = filter;
    loadRef.current?.();
  }, [filter]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current
      ?.getSource<GeoJSONSource>(ME_SOURCE_ID)
      ?.setData(pointFeatures(myLocation));
  }, [mapReady, myLocation]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current
      ?.getSource<GeoJSONSource>(SELECTED_SOURCE_ID)
      ?.setData(pointFeatures(selected));
  }, [mapReady, selected]);

  /** 一覧で選ばれた場所に寄る。すでに寄っているときはズームを戻さない。 */
  const focus = useCallback((target: LatLng) => {
    setSelected(target);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 15),
    });
  }, []);

  /**
   * 現在地を取る。HTTPS でないと（localhost を除いて）ブラウザが拒否するので、
   * 本番の https://nigedoko.vercel.app/ が前提。
   */
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateError("このブラウザでは現在地を使えません");
      return;
    }

    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocating(false);
        setMyLocation(here);
        setPanel({ state: "list" });
        // 徒歩圏が見える程度まで寄る。点のまま返る件数に収まるズーム。
        mapRef.current?.flyTo({ center: [here.lng, here.lat], zoom: 14 });
      },
      (error) => {
        setLocating(false);
        setLocateError(geolocationMessage(error));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return (
    <>
      <ShelterFilterBar value={filter} onChange={setFilter} />
      <div className="relative min-h-0 flex-1">
        {/*
          地図のコンテナに `absolute inset-0` は使えない。MapLibre は要素に
          `maplibregl-map` クラスを付け、その CSS が `position: relative` を指定する。
          Tailwind の `.absolute` と詳細度が同じで、読み込み順が後の MapLibre 側が勝つ。
          結果 inset が効かず高さ 0 になり、MapLibre は既定の 300px にフォールバックして
          地図が真っ白になる。高さで指定する。
        */}
        <div ref={containerRef} className="size-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-3">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="pointer-events-auto rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-60"
          >
            {locating ? "現在地を取得中…" : "現在地から探す"}
          </button>
          {locateError && <Chip>{locateError}</Chip>}
          <StatusChip status={status} />
        </div>

        <ShelterPanel
          panel={panel}
          filter={filter}
          center={myLocation}
          onClose={() => {
            setPanel({ state: "closed" });
            setSelected(null);
          }}
          onSelect={(item) => setPanel({ state: "detail", id: item.id })}
          onBackToList={() => setPanel({ state: "list" })}
          onFocus={focus}
        />
      </div>
    </>
  );
}

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "位置情報の利用が許可されていません";
    case error.POSITION_UNAVAILABLE:
      return "現在地を取得できませんでした";
    case error.TIMEOUT:
      return "現在地の取得に時間がかかっています。もう一度お試しください";
    default:
      return "現在地を取得できませんでした";
  }
}

function pointFeatures(point: LatLng | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: point
      ? [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [point.lng, point.lat] },
            properties: {},
          },
        ]
      : [],
  };
}

function StatusChip({ status }: { status: Status }) {
  if (status.state === "loading") {
    return <Chip>読み込み中…</Chip>;
  }
  if (status.state === "error") {
    return <Chip>{status.message}</Chip>;
  }

  const { result } = status;
  return (
    <Chip>
      この範囲に <strong className="font-semibold">
        {result.total.toLocaleString("ja-JP")}
      </strong> 件
      {result.mode === "clusters" && (
        <span className="text-zinc-500">（多いのでまとめて表示）</span>
      )}
    </Chip>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full bg-white/95 px-3 py-1.5 text-xs text-zinc-700 shadow-sm ring-1 ring-black/10">
      {children}
    </div>
  );
}

/**
 * クラスタは HTML マーカーで描く。件数を地図上の文字で出すには
 * グリフ（フォントの pbf）の配信元が要るが、地理院タイルはラスタで
 * グリフを持たないため、symbol レイヤーが使えない。
 */
function clusterElement(count: number, onClick: () => void): HTMLElement {
  const size = Math.round(28 + 14 * Math.log10(count));
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = formatCount(count);
  el.setAttribute("aria-label", `${count.toLocaleString("ja-JP")}件。拡大する`);
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "border-radius:9999px",
    "background:rgba(255,255,255,0.92)",
    "border:2px solid #52525b",
    "color:#27272a",
    "font-size:11px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
  el.addEventListener("click", onClick);
  return el;
}

function formatCount(count: number): string {
  if (count >= 10000) return `${Math.round(count / 1000)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}
