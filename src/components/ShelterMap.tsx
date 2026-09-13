"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import AddressSearch from "@/components/AddressSearch";
import RegionJump from "@/components/RegionJump";
import SavePlaceDialog from "@/components/SavePlaceDialog";
import ShareSheet from "@/components/ShareSheet";
import ShelterFilterBar from "@/components/ShelterFilterBar";
import ShelterPanel, {
  type Origin,
  type PanelState,
} from "@/components/ShelterPanel";
import { kindOf } from "@/lib/kinds";
import type { LatLng } from "@/lib/nearby";
import { findPlaceAt, makePlace, MAX_PLACES, type Place } from "@/lib/places";
import * as placesStore from "@/lib/places-store";
import type { AreaBounds } from "@/lib/regions";
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

/**
 * 避難場所を描き始めるズーム。これより引いた画面では何も描かない。
 *
 * 全国ビューで19万件をクラスタにまとめると、画面が白い円で埋まるだけで
 * 何も読めず、そのうえ地点を指すこともできない。
 * 入口で効いているのは「全件が載っていること」ではなく
 * 「入力から始まらないこと」なので、全件表示のほうは降ろす。
 * 開いた画面は、地図と「場所を決める」ひと押しから始める。
 */
const MIN_DATA_ZOOM = 10;

const SOURCE_ID = "shelters";
const LAYER_ID = "shelter-points";

/** 現在地と選択中の点。避難場所の点より上に重ねる。 */
const ME_SOURCE_ID = "my-location";
const SELECTED_SOURCE_ID = "selected-shelter";

/**
 * 地図で指した地点の色。現在地の青とも、種別の橙・青（lib/kinds.ts）とも
 * 混ざらない色を使う。**現在地と指した地点は意味が違う**ので、
 * 形（丸とピン）と色の両方で分けて、取り違えさせない。
 */
const PICKED_COLOR = "#047857";

type Status =
  /** 起点がまだ決まっておらず、避難場所を描いていない状態 */
  | { state: "noOrigin" }
  /** 起点はあるがズームが浅く、避難場所を描いていない状態 */
  | { state: "zoomedOut" }
  | { state: "loading" }
  | { state: "ready"; result: SheltersResult }
  | { state: "error"; message: string };

export default function ShelterMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  /** 地図で指した地点のピン。クラスタの HTML マーカーとは寿命が別なので分けて持つ。 */
  const pinRef = useRef<Marker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<Status>({ state: "noOrigin" });
  const [filter, setFilter] = useState<ShelterFilter>({
    // 開いた瞬間に中身が入っていることを優先する。既定は絞り込みなし。
    kinds: ["EMERGENCY", "SHELTER"],
    disaster: null,
  });

  const [panel, setPanel] = useState<PanelState>({ state: "closed" });
  /**
   * 近い順の起点。現在地ボタンで取ったものと地図で指したものを1つの state に
   * まとめ、どちらなのかを source で持つ。起点は常に1つなので、
   * 2つ持って「どちらが勝つか」を決める必要がない。
   */
  const [origin, setOrigin] = useState<Origin | null>(null);
  /**
   * 「地図から選ぶ」モード。地図の素のクリックに常時ぶら下げると、
   * パン操作と誤爆する（とくにスマホ）。押したときだけ地点を置く。
   */
  const [picking, setPicking] = useState(false);
  /** 避難場所を描かないズーム域にいるか。初期状態（全国）は必ずここから始まる。 */
  const [lowZoom, setLowZoom] = useState(true);

  /**
   * 保存した拠点。正本は URL、localStorage はその写し。
   * どちらも React の外にあるので、ストアとして読む（lib/places-store.ts）。
   */
  const { places, offered } = useSyncExternalStore(
    placesStore.subscribe,
    placesStore.getSnapshot,
    placesStore.getServerSnapshot,
  );
  /** 起点を拠点として保存する最中 */
  const [saving, setSaving] = useState(false);
  /** 共有・印刷のシートを開いている最中 */
  const [sharing, setSharing] = useState(false);
  const [selected, setSelected] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // 地図に足したソースへ setData できるようになった時点。
  const [mapReady, setMapReady] = useState(false);

  // load() は地図を作る effect の中で閉じており、filter を直接読むと
  // 絞り込みを変えるたびに地図が作り直される。ref で最新を渡す。
  const filterRef = useRef(filter);
  const loadRef = useRef<(() => void) | null>(null);
  // 地図に登録したハンドラからモードを読むための最新値。
  const pickingRef = useRef(picking);
  // load() から起点を読むための最新値。filter と同じ理由で ref に置く。
  const originRef = useRef(origin);

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
        /*
          避難場所を描くのは、起点が決まってから。
          場所を決める前に点を出しても、どれが自分に関係あるのか分からず、
          地図が円で埋まって場所を指すことすらできなくなる。
          引いたままの画面でも描かない（全国の集計クエリは重く、結果も読めない）。
        */
        if (!originRef.current || map.getZoom() < MIN_DATA_ZOOM) {
          abortRef.current?.abort();
          clearMarkers();
          map.getSource<GeoJSONSource>(SOURCE_ID)?.setData({
            type: "FeatureCollection",
            features: [],
          });
          setStatus({
            state: originRef.current ? "zoomedOut" : "noOrigin",
          });
          return;
        }

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
          // 場所を決めている最中は詳細を開かない。下段が確定バーに変わっており、
          // そこへ一覧や詳細を重ねると何を操作しているのか分からなくなる。
          if (pickingRef.current) return;
          const feature = event.features?.[0];
          if (!feature) return;
          const { id } = feature.properties as { id: string };
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          setSelected({ lat, lng });
          setPanel({ state: "detail", id, from: "list" });
        });
        map.on("mouseenter", LAYER_ID, () => {
          if (pickingRef.current) return;
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_ID, () => {
          if (pickingRef.current) return;
          map.getCanvas().style.cursor = "";
        });

        // 描くズーム域に入ったかどうかだけを React に伝える。
        // 値が変わらなければ再描画は起きないので、ズーム中に毎フレーム呼んでよい。
        map.on("zoom", () => setLowZoom(map.getZoom() < MIN_DATA_ZOOM));

        // ピンは1本だけ作って、置く・外すを繰り返す。
        // しずく形の先端は、回転で中心から真下に対角の半分（約13px）ずれる。
        // その分だけ持ち上げて、先端が指した座標に重なるようにする。
        pinRef.current = new Marker({
          element: pinElement(),
          anchor: "center",
          offset: [0, -13],
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
      pinRef.current?.remove();
      pinRef.current = null;
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

  // 起点が決まった／変わったら取り直す。ここで初めて避難場所が出る。
  useEffect(() => {
    originRef.current = origin;
    loadRef.current?.();
  }, [origin]);

  // 起点の描き分け。現在地は青い丸、指した地点はピン。同じ表示にしない。
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    map
      .getSource<GeoJSONSource>(ME_SOURCE_ID)
      ?.setData(pointFeatures(origin?.source === "gps" ? origin : null));

    const pin = pinRef.current;
    if (!pin) return;
    if (origin?.source === "picked") {
      pin.setLngLat([origin.lng, origin.lat]).addTo(map);
    } else {
      pin.remove();
    }
  }, [mapReady, origin]);

  // 地図に登録済みのハンドラから読めるようにしておく。
  useEffect(() => {
    pickingRef.current = picking;
  }, [picking]);

  // 押す先を探しているうちに気が変わることがあるので、Esc でやめられるようにする。
  useEffect(() => {
    if (!picking) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [picking]);

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
   * 選んだ都道府県・市区町村の範囲へ飛ぶ。
   *
   * 外接矩形にそのまま合わせると、避難場所が1点しかない市町村では
   * 際限なく寄り、面積の広い市町村では避難場所を描かないズームまで引く。
   * どちらも上限・下限で止める。
   */
  const jumpTo = useCallback((area: AreaBounds) => {
    const map = mapRef.current;
    if (!map) return;
    const camera = map.cameraForBounds(
      [
        [area.minLng, area.minLat],
        [area.maxLng, area.maxLat],
      ],
      { padding: 32, maxZoom: 14 },
    );
    if (!camera?.center) return;
    map.easeTo({
      center: camera.center,
      zoom: Math.max(camera.zoom ?? MIN_DATA_ZOOM, MIN_DATA_ZOOM),
      duration: 600,
    });
  }, []);

  /** 保存した拠点を起点にする。座標は保存時に丸めてあるので、そのまま使う。 */
  const selectPlace = useCallback((place: Place) => {
    setPicking(false);
    setOrigin({
      lat: place.lat,
      lng: place.lng,
      source: "saved",
      name: place.name,
    });
    // 拠点は「8種 × 最寄り」の表から始める。ここが持ち帰るものなので。
    setPanel({ state: "summary" });
    const map = mapRef.current;
    if (map) liftAboveSheet(map, place, 14);
  }, []);

  /**
   * いまの起点を拠点として保存する。
   * 同じ名前と同じ地点は置き換える（「自宅」が2つある状態を作らない）。
   */
  const savePlace = useCallback(
    (name: string) => {
      setSaving(false);
      if (!origin) return;
      const place = makePlace(name, origin.lat, origin.lng);
      if (!place) return;

      placesStore.savePlace(place);
      setOrigin({ ...place, source: "saved", name: place.name });
      setPanel({ state: "summary" });
    },
    [origin],
  );

  /** 住所の候補や拠点など、決まった1点に寄る。 */
  const jumpToPoint = useCallback((point: LatLng, zoom = 15) => {
    mapRef.current?.easeTo({
      center: [point.lng, point.lat],
      zoom,
      duration: 600,
    });
  }, []);

  /** 場所を決めるモードに入る。下段は確定バーに譲るので、一覧は閉じる。 */
  const startPicking = useCallback(() => {
    setPicking(true);
    setPanel({ state: "closed" });
    setSelected(null);
  }, []);

  /**
   * 画面中央を起点にする。
   *
   * 地図を押して置く方式はやめた。押した場所が指で隠れるうえ、
   * 全国ビューからは目的の街に当てられず、パン操作とも誤爆する。
   * 地図を動かして十字に合わせるほうが、片手でも狙いを詰められる。
   */
  const confirmPick = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { lat, lng } = map.getCenter();
    setPicking(false);
    setOrigin({ lat, lng, source: "picked" });
    setPanel({ state: "list" });
    liftAboveSheet(map, { lat, lng });
  }, []);

  /**
   * 現在地を取る。HTTPS でないと（localhost を除いて）ブラウザが拒否するので、
   * 本番の https://wagaya-nigesaki.vercel.app/ が前提。
   */
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateError("このブラウザでは現在地を使えません");
      return;
    }

    setLocating(true);
    setLocateError(null);
    setPicking(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocating(false);
        setOrigin({ ...here, source: "gps" });
        setPanel({ state: "list" });
        // 徒歩圏が見える程度まで寄る。点のまま返る件数に収まるズーム。
        const map = mapRef.current;
        if (map) liftAboveSheet(map, here, 14);
      },
      (error) => {
        setLocating(false);
        setLocateError(geolocationMessage(error));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  // 起点が無いあいだの案内。避難場所も描いていないので、隠してしまうものは無い。
  const showStartCard = origin === null && !picking;
  /** いまの起点が、すでに拠点として保存されているか。 */
  const savedHere = origin ? findPlaceAt(places, origin) : undefined;

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
          {!showStartCard && !picking && (
            <button
              type="button"
              onClick={() => {
                setOrigin(null);
                setPanel({ state: "closed" });
                setSelected(null);
              }}
              className="pointer-events-auto rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            >
              場所を変える
            </button>
          )}
          {locateError && <Chip>{locateError}</Chip>}
          {!picking && !showStartCard && <StatusChip status={status} />}
        </div>

        {/*
          開いた直後の画面。全国の点を出す代わりに、ここで場所を決めてもらう。
          選択肢は2つだけにして、既定は現在地（1タップで終わる）。
        */}
        {showStartCard && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
              <p className="text-sm leading-snug font-semibold text-zinc-900">
                まず、調べたい場所を決めます
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                その場所から、災害の種類ごとに使える避難場所を近い順に出します。
              </p>

              {/*
                保存した拠点を先頭に置く。2回目以降はここを1回押せば終わる、
                というのが生活拠点モデルの入口（.local/PLAN.md「利用シーンの整理」）。
              */}
              {places.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {places.map((place) => (
                    <div key={place.name} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectPlace(place)}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
                      >
                        {place.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`${place.name}を削除`}
                        onClick={() => placesStore.removePlace(place.name)}
                        className="shrink-0 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-900"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSharing(true)}
                    className="mt-0.5 self-start text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
                  >
                    家族に送る・紙に出す（QR コード）
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={locate}
                disabled={locating}
                className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
              >
                {locating ? "現在地を取得中…" : "現在地から探す"}
              </button>
              <button
                type="button"
                onClick={startPicking}
                className="mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: PICKED_COLOR }}
              >
                地図から選ぶ
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                引っ越し先や実家など、いま居ない場所も選べます。
              </p>
            </div>
          </div>
        )}

        {/* 場所を決めているあいだ。十字は画面の中心＝地図の中心に重なる。 */}
        {picking && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Crosshair />
            </div>
            <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200 bg-white px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
              <p className="text-xs leading-relaxed text-zinc-600">
                調べたい場所を、中央の十字に合わせてください
                {lowZoom && "（まだ広すぎます。下の選択か拡大で寄せてください）"}
              </p>
              {/*
                全国から指で拡大していくのは手間が大きいので、名前から寄れる道を2つ出す。
                住所を知っているときは上、地名しか分からないときは下。
              */}
              <div className="mt-2">
                <AddressSearch onPick={(hit) => jumpToPoint(hit)} />
              </div>
              <div className="mt-1.5">
                <RegionJump onJump={jumpTo} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={confirmPick}
                  disabled={lowZoom}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: PICKED_COLOR }}
                >
                  ここにする
                </button>
              </div>
            </div>
          </>
        )}

        {sharing && places.length > 0 && (
          <ShareSheet places={places} onClose={() => setSharing(false)} />
        )}

        {saving && origin && (
          <SavePlaceDialog
            usedNames={places.map((p) => p.name)}
            onSave={savePlace}
            onCancel={() => setSaving(false)}
          />
        )}

        {/* 送られた URL を開いただけで、この端末の拠点が消えるのは事故。必ず聞く。 */}
        {offered && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
            <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
              <p className="text-sm font-semibold text-zinc-900">
                この URL に{offered.length}つの場所が入っています
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {offered.map((p) => p.name).join("・")}
                。この端末には別の拠点が保存されています。どちらを使いますか。
              </p>
              <button
                type="button"
                onClick={() => placesStore.acceptOffered(true)}
                className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              >
                URL の場所に入れ替える
              </button>
              <button
                type="button"
                onClick={() => placesStore.acceptOffered(false)}
                className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
              >
                今回だけ見る（保存しない）
              </button>
              <button
                type="button"
                onClick={() => placesStore.keepCurrent()}
                className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-zinc-500"
              >
                この端末の拠点を使う
              </button>
            </div>
          </div>
        )}

        <ShelterPanel
          panel={picking ? { state: "closed" } : panel}
          filter={filter}
          origin={savedHere ? { ...origin!, name: savedHere.name } : origin}
          onSavePlace={
            origin && !savedHere && places.length < MAX_PLACES
              ? () => setSaving(true)
              : undefined
          }
          onClose={() => {
            setPanel({ state: "closed" });
            setSelected(null);
          }}
          // 戻り先は、開いたときに見ていたほうにする。
          onSelect={(item) =>
            setPanel((current) => ({
              state: "detail",
              id: item.id,
              from: current.state === "summary" ? "summary" : "list",
            }))
          }
          onShow={(state) => setPanel({ state })}
          onFocus={focus}
        />
      </div>
    </>
  );
}

/**
 * 起点を画面の少し上に置き直す。真ん中に寄せると、開いた一覧のシートに隠れる。
 */
function liftAboveSheet(map: MapLibreMap, target: LatLng, zoom?: number) {
  const lift = Math.round(map.getContainer().clientHeight * 0.18);
  map.flyTo({
    center: [target.lng, target.lat],
    zoom: zoom ?? map.getZoom(),
    // 指定した中心を、画面の中央より lift だけ上に置く。
    offset: [0, -lift],
  });
}

/** 場所を決めるときの照準。地図の中心に重ねる。 */
function Crosshair() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle
        cx="22"
        cy="22"
        r="11"
        fill="none"
        stroke={PICKED_COLOR}
        strokeWidth="2.5"
        opacity="0.9"
      />
      <circle cx="22" cy="22" r="2" fill={PICKED_COLOR} />
      {[
        [22, 0, 22, 8],
        [22, 36, 22, 44],
        [0, 22, 8, 22],
        [36, 22, 44, 22],
      ].map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={PICKED_COLOR}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
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

/**
 * 指した地点のピン。地理院タイルはラスタでグリフを持たず symbol レイヤーが
 * 使えないので、クラスタと同じく HTML マーカーで描く。
 * 現在地の丸と形から違えるために、しずく形にして先端を地点に合わせる。
 */
function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    "width:18px",
    "height:18px",
    "border-radius:50% 50% 50% 0",
    "transform:rotate(-45deg)",
    `background:${PICKED_COLOR}`,
    "border:2px solid #ffffff",
    "box-shadow:0 1px 3px rgba(0,0,0,0.35)",
  ].join(";");
  return el;
}

function StatusChip({ status }: { status: Status }) {
  if (status.state === "noOrigin") {
    return <Chip>場所を決めると、そこから近い順に出します</Chip>;
  }
  if (status.state === "zoomedOut") {
    return <Chip>拡大すると、この範囲の避難場所が出ます</Chip>;
  }
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
