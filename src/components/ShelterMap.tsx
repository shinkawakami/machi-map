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
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import Modal from "@/components/Modal";
import SavePlaceDialog from "@/components/SavePlaceDialog";
import ShareSheet from "@/components/ShareSheet";
import ShelterPanel, {
  type Origin,
  type PanelView,
} from "@/components/ShelterPanel";
import { kindOf } from "@/lib/kinds";
import type { LatLng } from "@/lib/nearby";
import { findPlaceAt, makePlace, MAX_PLACES, type Place } from "@/lib/places";
import * as placesStore from "@/lib/places-store";
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
 * 拠点をまだ持っていない人に最初に見せる場所。
 *
 * 全国から始めると、避難場所が1つも出ていない画面をまず見ることになり、
 * 何のアプリか分からないまま終わる。**動いている画面を見せたほうが早い**ので、
 * 避難場所が密にある場所（東京駅まわり）を例として出す。
 * 「なぜここ？」にならないよう、パネル側で例であることを断る。
 * 2回目以降は拠点が起点になるので、ここは使われない。
 */
const SAMPLE_VIEW = { center: [139.7671, 35.6812] as [number, number], zoom: 13 };
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

/**
 * クラスタの目標セルサイズ（px）。API に渡す分割数のもとになる。
 *
 * **まとめた円は画面には描かない。** 全国の密度は、場所を決める判断にも
 * 逃げ先を知る判断にも使われない情報で、入口の主役（地図を押して場所を決める）と
 * 押す対象を取り合うだけだった。
 * サーバー側の点／クラスタ切り替えは残してある。あれは「広い範囲で3万点を返さない」
 * ための上限で、画面に出すかどうかとは別の話。
 */
const CLUSTER_CELL_PX = 150;

/**
 * 押して寄るときの1回ぶんの段。
 * クラスタを押したときの寄り方（+2）とそろえる。同じ地図で寄り方が2種類あると、
 * どれだけ動くかが読めない。1回で大きく飛ぶと、行き過ぎたときに戻す手間のほうが増える。
 */
const ZOOM_STEP = 2;

const SOURCE_ID = "shelters";
const LAYER_ID = "shelter-points";

/** 選択中の避難場所。点より上に重ねる。 */
const SELECTED_SOURCE_ID = "selected-shelter";

/**
 * 起点（あなたの場所）の色と形。ピンと、選んでいない拠点の印に使う。
 *
 * **星＋黄。** 星は「保存したもの」の慣習どおりで、保存・共有の帯（淡い黄）とも
 * 色の筋がそろう。避難場所の橙（#ea580c）と近いのが唯一の懸念なので、
 * より黄寄りの色にして、形（星と丸）と白縁でも差を付ける。
 *
 * 緑にしていた時期があるが、あれは「残っていた色域」という消去法の理由で、
 * しかも防災の文脈では「安全・OK」に読める。指しているのは自宅であって
 * 安全な場所ではない。
 */
const PICKED_COLOR = "#f59e0b";

/**
 * 現在地の色。指定避難所の青（#1d4ed8）と紛れないよう、青緑に寄せる。
 * 形（照準）と合わせて、避難場所の点とは二重に分ける。
 */
const MY_LOCATION_COLOR = "#0891b2";

type Status =
  /** 範囲が広すぎて、サーバーが点ではなく集計を返した状態 */
  | { state: "tooWide" }
  | { state: "loading" }
  | { state: "ready"; result: SheltersResult }
  | { state: "error"; message: string };

export default function ShelterMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** 起点のピン。1本だけ作って、置く・外すを繰り返す。 */
  const pinRef = useRef<Marker | null>(null);
  /** 起点になっていない拠点の印。拠点が変わるたびに作り直す。 */
  const placeMarkersRef = useRef<Marker[]>([]);
  /** 現在地の印。拠点と同じく、起点でなくても出し続ける。 */
  const myMarkerRef = useRef<Marker | null>(null);
  /** Marker は地図を作る effect の中でしか import していないので、外から使えるよう控える。 */
  const markerCtorRef = useRef<typeof Marker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 「元に戻す」を引っ込めるまでの時計 */
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 起点を戻せるあいだの時計。拠点の削除とは別に持つ */
  const originUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [filter, setFilter] = useState<ShelterFilter>({
    // 開いた瞬間に中身が入っていることを優先する。既定は絞り込みなし。
    kinds: ["EMERGENCY", "SHELTER"],
    disaster: null,
  });

  /**
   * パネルに出しているもの。**操作も結果もここ1本で持つ。**
   * 起点がまだ無いあいだは、どの値であってもパネル側が案内を出す。
   */
  const [view, setView] = useState<PanelView>({ state: "summary" });
  /** 狭い画面で見出しだけに畳んでいるか（地図を広く見たいとき） */
  const [collapsed, setCollapsed] = useState(false);
  /**
   * 近い順の起点。現在地ボタンで取ったものと地図で指したものを1つの state に
   * まとめ、どちらなのかを source で持つ。起点は常に1つなので、
   * 2つ持って「どちらが勝つか」を決める必要がない。
   */
  const [pickedOrigin, setPickedOrigin] = useState<Origin | null>(null);

  /**
   * 保存した拠点。正本は URL、localStorage はその写し。
   * どちらも React の外にあるので、ストアとして読む（lib/places-store.ts）。
   */
  const { places, offered } = useSyncExternalStore(
    placesStore.subscribe,
    placesStore.getSnapshot,
    placesStore.getServerSnapshot,
  );

  /**
   * 2回目以降は、開いた時点で拠点が起点になる。
   *
   * 拠点を持っている人が、全国の地図から始めて自分で寄り直す理由は無い。
   * URL で届いた拠点でも同じで、送られた人はその場所を見たくて開いている。
   * 拠点を1つも持っていないときだけ全国から始める（どこを出すべきか分からないので、
   * 適当な都市を出すと「なぜここ？」になる）。
   */
  const firstPlace = places[0];
  const autoOrigin: Origin | null = useMemo(
    () =>
      firstPlace
        ? {
            lat: firstPlace.lat,
            lng: firstPlace.lng,
            source: "saved",
            name: firstPlace.name,
          }
        : null,
    [firstPlace],
  );
  /** 起点を拠点として保存する最中 */
  const [saving, setSaving] = useState(false);
  /** 共有・印刷のシートを開いている最中 */
  const [sharing, setSharing] = useState(false);
  /** 直前に消した拠点。しばらくのあいだ戻せるようにしておく */
  const [removedPlace, setRemovedPlace] = useState<Place | null>(null);
  /**
   * 地図を押して起点が移ったときの、戻り先。
   *
   * **地図を押す操作だけ、押すつもりが無くても起きる。** 住所・現在地・★は
   * 自分で選んだ操作なので戻す口は要らないが、地図のタップはパンの終わりと
   * 見分けがつかず、当たると表が丸ごと入れ替わる。しかも移る前の起点が
   * 拠点でなければ（住所で指した地点など）、★から戻ることもできない。
   *
   * 移った先（to）も一緒に持つ。起点がさらに動いたら、この申し出は古くなって
   * 黙って消える——押す口をひとつずつ閉じて回らなくて済む。
   */
  const [originUndo, setOriginUndo] = useState<{
    from: Origin;
    /** 移る前に見ていた面。戻すなら見ていたところまで戻す */
    fromView: PanelView;
    to: Origin;
  } | null>(null);
  const [selected, setSelected] = useState<LatLng | null>(null);
  /** 実際の起点。自分で決めたものが優先で、無ければ拠点の1つ目。 */
  const origin = pickedOrigin ?? autoOrigin;
  /** 最後に取れた現在地。起点とは別に持ち、地図には出し続ける。 */
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // 地図に足したソースへ setData できるようになった時点。
  const [mapReady, setMapReady] = useState(false);

  /*
    畳むのは狭い画面だけの話。畳んだまま広い画面に変わると、開くボタンが
    md:hidden で消えるので、検索も絞り込みも保存も出せないまま戻せなくなる。
    境目は liftAboveSheet と同じ 768px（Tailwind の md）にそろえる。
  */
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (wide.matches) setCollapsed(false);
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  // load() は地図を作る effect の中で閉じており、filter を直接読むと
  // 絞り込みを変えるたびに地図が作り直される。ref で最新を渡す。
  const filterRef = useRef(filter);
  const loadRef = useRef<(() => void) | null>(null);
  // load() から起点を読むための最新値。filter と同じ理由で ref に置く。
  const originRef = useRef(origin);
  // 地図の click ハンドラから「移る前に見ていた面」を読むための控え。
  const viewRef = useRef(view);
  /** いま避難場所の点が地図に出ているか。地図を押したときの意味をこれで決める。 */
  const pointsShownRef = useRef(false);
  /**
   * 地図の既定のカーソル。押したときの意味（置く／寄る）とそろえる。
   * 点の上に乗ったときは pointer に変わるので、離れたらここへ戻す。
   */
  const baseCursorRef = useRef("");

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
        center: SAMPLE_VIEW.center,
        zoom: SAMPLE_VIEW.zoom,
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
        pointsShownRef.current = false;

        try {
          const res = await fetch(`/api/shelters?${query}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
          const result: SheltersResult = await res.json();
          if (disposed) return;

          /*
            **点が出ているかどうかを、地図を押したときの意味とそろえる。**
            押せば置ける状態なのに避難場所が見えない、という食い違いを無くす。
            点が出るかどうかはズームではなく件数で決まる（同じ z12 でも都心と
            地方で違う）ので、ズームの数字ではなく実際の結果で判定する。
          */
          pointsShownRef.current = result.mode === "points";
          // 押せば置ける状態なら crosshair、寄るだけなら zoom-in。
          // 起点の有無ではなく点の有無で決める（クリックの分岐と同じ基準）。
          baseCursorRef.current =
            result.mode === "points" ? "crosshair" : "zoom-in";
          map.getCanvas().style.cursor = baseCursorRef.current;

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

          setStatus(
            result.mode === "clusters"
              ? { state: "tooWide" }
              : { state: "ready", result },
          );
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
          setView({ state: "detail", id, from: "list" });
        });
        /*
          地図を押したときの意味は、**避難場所が出ているかどうかで変える**。

          広い画面で押した1点は精度が出ないので、そこにピンを置いても直す手間が増える。
          出ていないうちは「押した場所に寄る」だけにして、避難場所が見えてから置く。
          「適当に押す → 寄る → もう一度押す → 置く」で、ドラッグは最後の数十 m だけになる。

          出ているかどうかを基準にすると、**置ける状態なら必ず避難場所が見えている**。
          ズームの数字で切ると、件数しだいで「押せるのに何も見えない」が起きる。

          避難場所の点の上を押したときは、こちらではなく詳細（LAYER_ID のハンドラ）が拾う。
        */
        map.on("click", (event) => {
          const { lat, lng } = event.lngLat;

          // 避難場所がまだ出ていない＝広すぎる。押した場所に寄るだけにする。
          if (!pointsShownRef.current) {
            map.easeTo({
              center: [lng, lat],
              zoom: map.getZoom() + ZOOM_STEP,
              duration: 400,
            });
            return;
          }

          // 点の上を押したときは詳細を開く側に任せる。
          if (map.queryRenderedFeatures(event.point, { layers: [LAYER_ID] }).length) {
            return;
          }

          // 置くときは地図を動かさない。押した場所が目の前にあるのに、
          // 勝手に寄ったり中央に寄せたりすると、どこを押したのか見失う。
          const previous = originRef.current;
          const previousView = viewRef.current;
          const next: Origin = { lat, lng, source: "picked" };

          setSelected(null);
          setPickedOrigin(next);
          setView({ state: "list" });

          // 戻り先があるときだけ申し出る。まだ起点が無いなら、戻す先も無い。
          if (previous) {
            setOriginUndo({ from: previous, fromView: previousView, to: next });
            if (originUndoTimerRef.current) {
              clearTimeout(originUndoTimerRef.current);
            }
            originUndoTimerRef.current = setTimeout(
              () => setOriginUndo(null),
              12_000,
            );
          }
        });

        map.on("mouseenter", LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_ID, () => {
          map.getCanvas().style.cursor = baseCursorRef.current;
        });

        /*
          起点のピン。**ドラッグで直せる。**
          「地図から選ぶ」モードに切り替えて十字を合わせる形はやめた。
          住所か現在地でその場所まで来ているのに、モードを切り替えて
          そこでまた住所や地名を選ばせるのは、同じ仕事を二重にやらせていた。
          ずらしたいのは数十 m なので、つまんで動かすほうが速い。

          SVG の先端（下端の中央）を座標に合わせるので、anchor は bottom。
        */
        markerCtorRef.current = Marker;

        const pin = new Marker({
          element: pinElement(),
          anchor: "bottom",
          draggable: true,
        });
        pin.on("dragend", () => {
          const { lat, lng } = pin.getLngLat();
          // 動かした時点で「保存した拠点そのもの」ではなくなるので、名前は外す。
          setPickedOrigin({ lat, lng, source: "picked" });
        });
        pinRef.current = pin;

        // 選択中の避難場所。中身は別の effect から setData で入れる。
        map.addSource(SELECTED_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
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
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (originUndoTimerRef.current) clearTimeout(originUndoTimerRef.current);
      abortRef.current?.abort();
      pinRef.current?.remove();
      pinRef.current = null;
      for (const marker of placeMarkersRef.current) marker.remove();
      placeMarkersRef.current = [];
      myMarkerRef.current?.remove();
      myMarkerRef.current = null;
      markerCtorRef.current = null;
      loadRef.current = null;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

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

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /*
    起点のピン。**決め方に関係なく、起点があれば必ず出す。**
    以前は「地図で指したとき」だけ出していたので、保存した拠点を選んでも
    現在地を取っても、地図に何も出ていなかった。
  */
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const pin = pinRef.current;
    if (!map || !pin) return;

    if (origin) {
      pin.setLngLat([origin.lng, origin.lat]).addTo(map);
    } else {
      pin.remove();
    }
  }, [mapReady, origin]);


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

  /** 保存した拠点を起点にする。座標は保存時に丸めてあるので、そのまま使う。 */
  const selectPlace = useCallback((place: Place) => {
    setPickedOrigin({
      lat: place.lat,
      lng: place.lng,
      source: "saved",
      name: place.name,
    });
    // 拠点は「8種 × 最寄り」の表から始める。ここが持ち帰るものなので。
    setView({ state: "summary" });
    const map = mapRef.current;
    if (map) liftAboveSheet(map, place, 14);
  }, []);

  /*
    拠点が起点になったときは、そこから始める。
    例の場所から飛んでいく様子を見せる必要はないので、アニメーションは挟まない。
  */
  useEffect(() => {
    if (!mapReady || pickedOrigin || !autoOrigin) return;
    const map = mapRef.current;
    if (map) liftAboveSheet(map, autoOrigin, 14, true);
  }, [mapReady, pickedOrigin, autoOrigin]);

  /*
    現在地が分かっているあいだは、拠点と同じように地図に出し続ける。
    起点を自宅に切り替えたあとでも「いま自分がどこにいるか」は残したいし、
    押せば現在地に戻せる。起点になっているときは大きいピンのほうで出ているので描かない。
  */
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const Ctor = markerCtorRef.current;
    if (!map || !Ctor) return;

    myMarkerRef.current?.remove();
    myMarkerRef.current = null;

    if (!myLocation || origin?.source === "gps") return;

    const marker = new Ctor({
      element: myLocationElement(() => {
        setPickedOrigin({ ...myLocation, source: "gps" });
        setView({ state: "list" });
        liftAboveSheet(map, myLocation, 14);
      }),
      anchor: "left",
    })
      .setLngLat([myLocation.lng, myLocation.lat])
      .addTo(map);
    myMarkerRef.current = marker;
  }, [mapReady, myLocation, origin]);

  /*
    選んでいない拠点も地図に出す。**どこに登録したのかが地図で分かる**ようにし、
    押せばそのまま起点を切り替えられる。起点になっている拠点は大きいピンのほうで
    出ているので、ここでは描かない。
  */
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const Ctor = markerCtorRef.current;
    if (!map || !Ctor) return;

    for (const marker of placeMarkersRef.current) marker.remove();
    placeMarkersRef.current = places
      .filter((place) => !origin || !findPlaceAt([place], origin))
      .map((place) =>
        new Ctor({
          element: placeElement(place.name, () => selectPlace(place)),
          // 要素の左端＝印の中心が座標に重なる。名前は右へ伸ばす。
          anchor: "left",
        })
          .setLngLat([place.lng, place.lat])
          .addTo(map),
      );
  }, [mapReady, places, origin, selectPlace]);

  /**
   * いまの起点を拠点として保存する。
   * 同じ名前と同じ地点は置き換える（「自宅」が2つある状態を作らない）。
   */
  /**
   * 拠点を消す。**すぐ消えて終わりにしない。**
   * 自分で作ったものが1タップで消え、URL まで書き換わるので、
   * しばらくのあいだ戻せる状態を残す。
   */
  const removePlace = useCallback((place: Place) => {
    placesStore.removePlace(place.name);
    setRemovedPlace(place);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setRemovedPlace(null), 12_000);
  }, []);

  /** 押し間違いで移った起点を、見ていた面ごと戻す。 */
  const undoOriginChange = useCallback(() => {
    if (!originUndo) return;
    if (originUndoTimerRef.current) clearTimeout(originUndoTimerRef.current);

    setPickedOrigin(originUndo.from);
    setView(originUndo.fromView);
    setSelected(null);
    setOriginUndo(null);

    // 画面のほうも戻す。ズームは触らない（押した場所の見え方のまま帰す）。
    const map = mapRef.current;
    if (map) liftAboveSheet(map, originUndo.from);
  }, [originUndo]);

  const undoRemove = useCallback(() => {
    setRemovedPlace((place) => {
      if (place) placesStore.savePlace(place);
      return null;
    });
  }, []);

  const savePlace = useCallback(
    (name: string) => {
      setSaving(false);
      if (!origin) return;
      const place = makePlace(name, origin.lat, origin.lng);
      if (!place) return;

      placesStore.savePlace(place);
      setPickedOrigin({ ...place, source: "saved", name: place.name });
      setView({ state: "summary" });
    },
    [origin],
  );

  /** 住所の候補を選んだら、そのまま起点にする。町丁目の代表点に置く。 */
  const pickAddress = useCallback((hit: { lat: number; lng: number }) => {
    const point = { lat: hit.lat, lng: hit.lng };
    setPickedOrigin({ ...point, source: "picked" });
    setView({ state: "list" });
    const map = mapRef.current;
    if (map) liftAboveSheet(map, point, 15);
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocating(false);
        setMyLocation(here);
        setPickedOrigin({ ...here, source: "gps" });
        setView({ state: "list" });
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

  /** いまの起点が、すでに拠点として保存されているか。 */
  const savedHere = origin ? findPlaceAt(places, origin) : undefined;
  /**
   * 戻せる起点。**移した先から起点がさらに動いていたら、もう出さない。**
   * 住所や現在地で決め直したあとに「元に戻す」が残っていると、
   * 自分で選んだ操作のほうが取り消される。
   */
  const undoableOrigin =
    originUndo && sameOrigin(origin, originUndo.to) ? originUndo.from : null;

  return (
    <>
      <div className="relative min-h-0 flex-1">
        {/*
          地図のコンテナに `absolute inset-0` は使えない。MapLibre は要素に
          `maplibregl-map` クラスを付け、その CSS が `position: relative` を指定する。
          Tailwind の `.absolute` と詳細度が同じで、読み込み順が後の MapLibre 側が勝つ。
          結果 inset が効かず高さ 0 になり、MapLibre は既定の 300px にフォールバックして
          地図が真っ白になる。高さで指定する。
        */}
        <div ref={containerRef} className="size-full" />

        {/*
          地図に重ねるのは「地図の一部」だけにする。ピン・現在地の印・件数がそれで、
          操作ボタンは置かない（操作はパネルに集めた）。
        */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-3 md:pl-[21rem] lg:pl-[25rem]">
          <StatusChip status={status} />
        </div>

        {/*
          現在地はいつでも押せるようにする。パネルの状態に左右されない場所として、
          ズーム（MapLibre の NavigationControl・右上）の真下に置き、
          地図の操作系としてまとめる。下に置くと、スマホでは下のシートに隠れる。

          **記号だけにしない。** 照準の記号は地図アプリの慣習どおりだが、
          タッチ端末では title が出ないので、記号を知らない人には手がかりが無くなる。
          文字を添えて、高さも 29px（ズームと同じ）から 40px に上げ、指で押せる大きさにする。
        */}
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-label="現在地から探す"
          className="absolute top-[76px] right-2.5 z-10 flex h-10 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-60"
        >
          <LocateIcon active={locating} />
          {locating ? "取得中…" : "現在地"}
        </button>

        {/*
          引き戻して避難場所が見えなくなったときの案内。
          開いた直後は東京駅まわり（SAMPLE_VIEW）か拠点から始まるので、
          この状態になるのは自分で引いたときだけ。だから"できない話"でも第一印象にならない。
          枠は押しても地図に届く（＝そのまま寄れる）ようにしてある。
        */}
        {status.state === "tooWide" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 md:pl-[21rem] lg:pl-[25rem]">
            <div className="max-w-xs rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur-sm">
              <p className="text-sm font-semibold text-zinc-900">
                この範囲は広すぎて、避難場所を出せません
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                調べたい場所まで寄ってください。
                <br />
                <strong className="font-medium text-zinc-900">
                  地図を押すと、その場所に寄ります。
                </strong>
                避難場所が出たら、押した場所にピンを置けます。
              </p>
            </div>
          </div>
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

        {/*
          送られた URL を開いただけで、この端末の拠点が消えるのは事故。必ず聞く。
          **答えるまで背後を触らせない**（Modal に閉じ方を渡さない）。
          以前は背後が押せたので、3択を出したまま拠点を保存でき、その保存が
          syncUrl でフラグメントを書き換えて、届いたほうの拠点を消していた。
        */}
        {offered && (
          <Modal label="この URL に入っている場所を使いますか">
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
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-zinc-600"
            >
              この端末の拠点を使う
            </button>
          </Modal>
        )}

        <ShelterPanel
          view={view}
          filter={filter}
          origin={origin}
          places={places}
          locateError={locateError}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((on) => !on)}
          onShow={(state) => setView({ state })}
          onChangeFilter={setFilter}
          onPickAddress={pickAddress}
          onSelectPlace={selectPlace}
          onRemovePlace={(name) => {
            const place = places.find((p) => p.name === name);
            if (place) removePlace(place);
          }}
          removedPlace={removedPlace}
          onUndoRemove={undoRemove}
          undoableOrigin={undoableOrigin}
          onUndoOrigin={undoOriginChange}
          onSavePlace={
            origin && !savedHere && places.length < MAX_PLACES
              ? () => setSaving(true)
              : undefined
          }
          // 保存ボタンが消える理由は2つあり、片方（上限）は言わないと分からない。
          saveFull={
            Boolean(origin) && !savedHere && places.length >= MAX_PLACES
          }
          onShare={() => setSharing(true)}
          onFocus={focus}
        />
      </div>
    </>
  );
}

/** 同じ起点か。座標と、どう決めたかがそろっていれば同じものとして扱う。 */
function sameOrigin(a: Origin | null, b: Origin | null): boolean {
  return Boolean(
    a &&
      b &&
      a.lat === b.lat &&
      a.lng === b.lng &&
      a.source === b.source &&
      a.name === b.name,
  );
}

/**
 * 起点がパネルに隠れない位置へ置き直す。
 *
 * パネルは狭い画面では下から、広い画面では左から出るので、避ける向きも変える。
 * 判定は Tailwind の md（768px）とそろえる。
 */
function liftAboveSheet(
  map: MapLibreMap,
  target: LatLng,
  zoom?: number,
  instant = false,
) {
  const container = map.getContainer();
  const wide = container.clientWidth >= 768;
  const offset: [number, number] = wide
    ? [Math.round(container.clientWidth * 0.16), 0]
    : [0, -Math.round(container.clientHeight * 0.18)];

  map.easeTo({
    center: [target.lng, target.lat],
    zoom: zoom ?? map.getZoom(),
    offset,
    duration: instant ? 0 : 1200,
  });
}

/** 現在地のアイコン。照準（十字＋中心の点）は地図アプリで共通の見た目。 */
function LocateIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#a1a1aa" : MY_LOCATION_COLOR}
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.6" fill={MY_LOCATION_COLOR} stroke="none" />
      <line x1="12" y1="1.5" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22.5" y2="12" />
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
 * 現在地の印。
 *
 * **丸にしない。** 塗りつぶしの丸は避難場所の点（橙・青）と同じ語彙で、
 * 小さく描くと色しか手がかりが残らない。地図右上の「現在地」ボタンと同じ
 * 照準の記号にして、色も指定避難所の青（#1d4ed8）から離した青緑にする。
 * ボタンと地図上の印が同じ記号なので、押した結果とも結びつく。
 * 押すと起点が現在地に戻る。
 */
function myLocationElement(onClick: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", "現在地に戻す");
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:4px",
    "padding:0",
    "background:none",
    "border:none",
    "cursor:pointer",
    // 記号の中心を座標に合わせる（anchor:left なので左端が座標）。
    "transform:translateX(-11px)",
  ].join(";");

  el.innerHTML = [
    '<svg width="22" height="22" viewBox="0 0 22 22" style="flex:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))">',
    // 白い下敷き。淡色地図の上でも記号が沈まないようにする。
    `<circle cx="11" cy="11" r="10" fill="#ffffff" opacity="0.9"/>`,
    `<g stroke="${MY_LOCATION_COLOR}" stroke-width="2" stroke-linecap="round" fill="none">`,
    '<circle cx="11" cy="11" r="5.5"/>',
    '<line x1="11" y1="1.5" x2="11" y2="4"/>',
    '<line x1="11" y1="18" x2="11" y2="20.5"/>',
    '<line x1="1.5" y1="11" x2="4" y2="11"/>',
    '<line x1="18" y1="11" x2="20.5" y2="11"/>',
    "</g>",
    `<circle cx="11" cy="11" r="2" fill="${MY_LOCATION_COLOR}"/>`,
    "</svg>",
    '<span style="padding:1px 6px;border-radius:9999px;background:rgba(255,255,255,0.92);border:1px solid rgba(82,82,91,0.25);color:#27272a;font-size:11px;font-weight:600;white-space:nowrap">現在地</span>',
  ].join("");

  el.addEventListener("click", onClick);
  return el;
}

/**
 * 起点になっていない拠点の印。名前が出ていないと、どれが自宅でどれが職場か分からない。
 * 起点のピンより小さく・薄くして、いま見ている拠点との差を付ける。
 */
function placeElement(name: string, onClick: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${name}に切り替える`);
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:4px",
    "padding:0",
    "background:none",
    "border:none",
    "cursor:pointer",
    // 印の中心を座標に合わせる（anchor:left なので左端が座標）。
    "transform:translateX(-9px)",
  ].join(";");

  el.innerHTML = [
    `<svg width="18" height="18" viewBox="0 0 18 18" style="flex:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.35))">`,
    `<path d="M9.0 1.0L11.1 6.2L16.6 6.5L12.3 10.1L13.7 15.5L9.0 12.5L4.3 15.5L5.7 10.1L1.4 6.5L6.9 6.2Z" fill="${PICKED_COLOR}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>`,
    "</svg>",
    `<span style="padding:1px 6px;border-radius:9999px;background:rgba(255,255,255,0.92);border:1px solid rgba(82,82,91,0.25);color:#27272a;font-size:11px;font-weight:600;white-space:nowrap">${name}</span>`,
  ].join("");

  el.addEventListener("click", onClick);
  return el;
}

/**
 * 起点のピン。地理院タイルはラスタでグリフを持たず symbol レイヤーが使えないので、
 * クラスタと同じく HTML マーカーで描く。
 *
 * **避難場所の点と取り違えられない形と大きさにする。** 点は半径 3〜10px の丸で、
 * 同じくらいの大きさの丸を置くと、色しか手がかりが無くなる。
 * 地面に刺さった軸を持つ縦長の形にして、幅も倍以上にした。
 * 先端（下端の中央）がそのまま座標を指すので、anchor は bottom で合う。
 */
const PIN_WIDTH = 30;
const PIN_HEIGHT = 42;

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    `width:${PIN_WIDTH}px`,
    `height:${PIN_HEIGHT}px`,
    // ドラッグで動かせることを、カーソルでも見せる。
    "cursor:grab",
    "filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
  ].join(";");

  el.innerHTML = [
    `<svg width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">`,
    // しずく形。下端の (15,42) が指し示す点。
    `<path d="M15 42C15 42 28 24 28 15A13 13 0 1 0 2 15C2 24 15 42 15 42Z"`,
    ` fill="${PICKED_COLOR}" stroke="#ffffff" stroke-width="2.5"/>`,
    // 中の白い星。「保存したもの」の印で、塗りつぶしの丸（避難場所の点）と見分く。
    `<path d="M15.0 7.8L16.8 12.5L21.8 12.8L17.9 16.0L19.2 20.8L15.0 18.1L10.8 20.8L12.1 16.0L8.2 12.8L13.2 12.5Z" fill="#ffffff"/>`,
    "</svg>",
  ].join("");

  return el;
}

function StatusChip({ status }: { status: Status }) {
  // 広すぎるときは、隅のチップではなく地図の中央の案内で言う。
  if (status.state === "tooWide") return null;
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

