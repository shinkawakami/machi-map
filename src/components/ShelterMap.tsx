"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SheltersResult } from "@/lib/shelters";

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

const COLOR_EMERGENCY = "#ea580c";
const COLOR_SHELTER = "#1d4ed8";

/** クラスタの目標セルサイズ（px）。画面幅から横方向の分割数を決める。 */
const CLUSTER_CELL_PX = 80;

const SOURCE_ID = "shelters";
const LAYER_ID = "shelter-points";

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
        Popup,
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

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStatus({ state: "loading" });

        try {
          const res = await fetch(
            `/api/shelters?bbox=${bbox}&cells=${cells}`,
            { signal: controller.signal },
          );
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

        map.on("click", LAYER_ID, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const { name, kind } = feature.properties as {
            name: string;
            kind: string;
          };
          new Popup({ offset: 12, closeButton: false })
            .setLngLat(event.lngLat)
            .setDOMContent(popupContent(name, kind))
            .addTo(map);
        });
        map.on("mouseenter", LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });

        // moveend の購読はソースを足した後で始める。
        // 先に発火すると setData の相手がまだ無い。
        map.on("moveend", () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          // 慣性スクロールの途中で何度も投げないよう、止まってから少し待つ。
          timerRef.current = setTimeout(() => void load(), 200);
        });

        void load();
      });
    })();

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      clearMarkers();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [clearMarkers]);

  return (
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
        <StatusChip status={status} />
        <Legend />
      </div>
    </div>
  );
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

function Legend() {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white/95 px-3 py-2 text-xs text-zinc-700 shadow-sm ring-1 ring-black/10">
      <span className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full ring-1 ring-white"
          style={{ backgroundColor: COLOR_EMERGENCY }}
        />
        指定緊急避難場所
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full ring-1 ring-white"
          style={{ backgroundColor: COLOR_SHELTER }}
        />
        指定避難所
      </span>
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

function popupContent(name: string, kind: string): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "font-size:13px;line-height:1.5;max-width:16rem";

  const badge = document.createElement("span");
  badge.textContent =
    kind === "EMERGENCY" ? "指定緊急避難場所" : "指定避難所";
  badge.style.cssText = [
    "display:inline-block",
    "padding:1px 6px",
    "border-radius:9999px",
    "font-size:11px",
    "color:#ffffff",
    `background:${kind === "EMERGENCY" ? COLOR_EMERGENCY : COLOR_SHELTER}`,
  ].join(";");

  const title = document.createElement("div");
  title.textContent = name;
  title.style.cssText = "margin-top:4px;font-weight:600";

  root.append(badge, title);
  return root;
}
