"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import * as placesStore from "@/client/places-store";
import { useTimedOffer } from "@/client/use-timed-offer";
import { liftAboveSheet, pointFeatures, WIDE_QUERY } from "@/features/map/camera";
import {
  attachInteractions,
  type MapInteractions,
} from "@/features/map/interactions";
import LocateButton from "@/features/map/LocateButton";
import MapChips from "@/features/map/MapChips";
import {
  addShelterLayers,
  MAP_STYLE,
  MAX_BOUNDS,
  SAMPLE_VIEW,
  SELECTED_SOURCE_ID,
} from "@/features/map/map-style";
import {
  myLocationElement,
  pinElement,
  placeElement,
} from "@/features/map/markers";
import {
  createShelterSource,
  type MapStatus,
  type ShelterSource,
} from "@/features/map/shelter-source";
import { useGeolocation } from "@/features/map/use-geolocation";
import { useOrigin } from "@/features/map/use-origin";
import UrlPlacesPrompt from "@/features/map/UrlPlacesPrompt";
import ShelterPanel from "@/features/panel/ShelterPanel";
import SavePlaceDialog from "@/features/places/SavePlaceDialog";
import ShareSheet from "@/features/places/ShareSheet";
import { noFilter, type ShelterFilter } from "@/lib/filter";
import type { LatLng } from "@/lib/geo";
import { findPlaceAt, makePlace, MAX_PLACES, type Place } from "@/lib/places";

/** 地図のイベントから呼ぶもの。控え（ref）越しに読む（下の注記を参照）。 */
type MapHandlers = MapInteractions & {
  /** ピンをドラッグして位置を直した */
  onDragPin: (at: LatLng) => void;
};

/**
 * 地図の画面。**この部品は組み立て役に徹する。**
 *
 * MapLibre の面倒（スタイル・レイヤー・マーカー・取得）は同じフォルダの
 * 小さいモジュールに分けてあり、起点まわりの state も use-origin.ts が持つ。
 * ここに残すのは「どれとどれを繋ぐか」と、React の外にあるもの
 * （地図インスタンスとマーカー）を state に合わせる effect だけ。
 */
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
  const sourceRef = useRef<ShelterSource | null>(null);

  const [status, setStatus] = useState<MapStatus>({ state: "loading" });
  // 開いた瞬間に中身が入っていることを優先する。既定は絞り込みなし。
  const [filter, setFilter] = useState<ShelterFilter>(noFilter);
  /** 狭い画面で見出しだけに畳んでいるか（地図を広く見たいとき） */
  const [collapsed, setCollapsed] = useState(false);
  /** 起点を拠点として保存する最中 */
  const [saving, setSaving] = useState(false);
  /** 共有・印刷のシートを開いている最中 */
  const [sharing, setSharing] = useState(false);
  /** 直前に消した拠点。しばらくのあいだ戻せるようにしておく */
  const [removedPlace, offerUndoRemove] = useTimedOffer<Place>(12_000);
  // 地図に足したソースへ setData できるようになった時点。
  const [mapReady, setMapReady] = useState(false);

  /**
   * 保存した拠点。正本は URL、localStorage はその写し。
   * どちらも React の外にあるので、ストアとして読む（src/client/places-store.ts）。
   */
  const { places, offered } = placesStore.usePlaces();
  const originState = useOrigin(places);
  const { origin, view, pick, select } = originState;

  /** 現在地を起点にする。ボタンからも、地図の現在地の印からも呼ぶ。 */
  const goToMyLocation = useCallback(
    (here: LatLng) => {
      pick({ ...here, source: "gps" }, { view: "list" });
      // 徒歩圏が見える程度まで寄る。点のまま返る件数に収まるズーム。
      const map = mapRef.current;
      if (map) liftAboveSheet(map, here, 14);
    },
    [pick],
  );
  const geo = useGeolocation(goToMyLocation);

  /*
    畳むのは狭い画面だけの話。畳んだまま広い画面に変わると、開くボタンが
    md:hidden で消えるので、検索も絞り込みも保存も出せないまま戻せなくなる。
    境目はパネルの出る向きと同じ 768px（Tailwind の md）にそろえる。
  */
  useEffect(() => {
    const wide = window.matchMedia(WIDE_QUERY);
    const sync = () => {
      if (wide.matches) setCollapsed(false);
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  /*
    地図に結ぶハンドラと、取得が読む絞り込み。**どちらも控え（ref）越しに渡す。**

    地図は一度しか作らないので、`map.on(...)` に直接渡すと**その時点の関数を
    永久に掴む**。いまは pick も絞り込みも安定して見えるが、依存がひとつ増えた
    瞬間に古いものを呼び続けるようになり、しかも黙って壊れる（押しても何も
    起きない、絞り込みが効かない）。読む側を控えにしておけば、そこを気にせずに済む。
  */
  const filterRef = useRef(filter);
  const handlersRef = useRef<MapHandlers>({
    onSelectPoint: () => {},
    onPickSpot: () => {},
    onDragPin: () => {},
  });

  useEffect(() => {
    filterRef.current = filter;
    handlersRef.current = {
      onSelectPoint: originState.openDetail,
      onPickSpot: (at) => {
        select(null);
        pick({ ...at, source: "picked" }, { view: "list", undoable: true });
      },
      // ピンを動かした時点で「保存した拠点そのもの」ではなくなるので、名前は外す。
      // 見ている面はそのまま（位置を直すだけの操作で、話題は変わっていない）。
      onDragPin: (at) => pick({ ...at, source: "picked" }),
    };
  });

  useEffect(() => {
    let disposed = false;

    void (async () => {
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
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        addShelterLayers(map);

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
          handlersRef.current.onDragPin({ lat, lng });
        });
        pinRef.current = pin;

        setMapReady(true);

        // 取得の購読はソースを足した後で始める。
        // 先に発火すると setData の相手がまだ無い。
        const source = createShelterSource(
          map,
          () => filterRef.current,
          setStatus,
        );
        sourceRef.current = source;
        attachInteractions(map, source, handlersRef);
      });
    })();

    return () => {
      disposed = true;
      sourceRef.current?.dispose();
      sourceRef.current = null;
      pinRef.current?.remove();
      pinRef.current = null;
      for (const marker of placeMarkersRef.current) marker.remove();
      placeMarkersRef.current = [];
      myMarkerRef.current?.remove();
      myMarkerRef.current = null;
      markerCtorRef.current = null;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // 地図は一度だけ作る。中で使う最新の値は ref 越しに読む。
  }, []);

  // 絞り込みか起点が変わったら取り直す。初回は地図の load がまだなので、
  // その場合は createShelterSource 側の初回呼び出しが拾う。
  useEffect(() => {
    sourceRef.current?.reload();
  }, [filter, origin]);

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

    if (origin) pin.setLngLat([origin.lng, origin.lat]).addTo(map);
    else pin.remove();
  }, [mapReady, origin]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current
      ?.getSource<GeoJSONSource>(SELECTED_SOURCE_ID)
      ?.setData(pointFeatures(originState.selected));
  }, [mapReady, originState.selected]);

  /*
    拠点が起点になったときは、そこから始める。
    例の場所から飛んでいく様子を見せる必要はないので、アニメーションは挟まない。
  */
  useEffect(() => {
    if (!mapReady || !originState.auto || !origin) return;
    const map = mapRef.current;
    if (map) liftAboveSheet(map, origin, 14, true);
  }, [mapReady, originState.auto, origin]);

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

    const here = geo.here;
    if (!here || origin?.source === "gps") return;

    myMarkerRef.current = new Ctor({
      element: myLocationElement(() => goToMyLocation(here)),
      anchor: "left",
    })
      .setLngLat([here.lng, here.lat])
      .addTo(map);
  }, [mapReady, geo.here, origin, goToMyLocation]);

  /** 保存した拠点を起点にする。座標は保存時に丸めてあるので、そのまま使う。 */
  const selectPlace = useCallback(
    (place: Place) => {
      // 拠点は「8種 × 最寄り」の表から始める。ここが持ち帰るものなので。
      pick({ ...place, source: "saved", name: place.name }, { view: "summary" });
      const map = mapRef.current;
      if (map) liftAboveSheet(map, place, 14);
    },
    [pick],
  );

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

  /** 一覧で選ばれた場所に寄る。すでに寄っているときはズームを戻さない。 */
  const focus = useCallback(
    (target: LatLng) => {
      select(target);
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: Math.max(map.getZoom(), 15),
      });
    },
    [select],
  );

  /**
   * 拠点を消す。**すぐ消えて終わりにしない。**
   * 自分で作ったものが1タップで消え、URL まで書き換わるので、
   * しばらくのあいだ戻せる状態を残す。
   */
  const removePlace = useCallback(
    (name: string) => {
      const place = places.find((p) => p.name === name);
      if (!place) return;
      placesStore.removePlace(name);
      offerUndoRemove(place);
    },
    [places, offerUndoRemove],
  );

  const undoRemove = useCallback(() => {
    if (removedPlace) placesStore.savePlace(removedPlace);
    offerUndoRemove(null);
  }, [removedPlace, offerUndoRemove]);

  /** 押し間違いで移った起点を、見ていた面ごと戻す。画面のほうも戻す。 */
  const undoOrigin = useCallback(() => {
    const back = originState.undo();
    // ズームは触らない（押した場所の見え方のまま帰す）。
    const map = mapRef.current;
    if (back && map) liftAboveSheet(map, back);
  }, [originState]);

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
      pick({ ...place, source: "saved", name: place.name }, { view: "summary" });
    },
    [origin, pick],
  );

  /** 住所の候補を選んだら、そのまま起点にする。町丁目の代表点に置く。 */
  const pickAddress = useCallback(
    (hit: LatLng) => {
      const point = { lat: hit.lat, lng: hit.lng };
      pick({ ...point, source: "picked" }, { view: "list" });
      const map = mapRef.current;
      if (map) liftAboveSheet(map, point, 15);
    },
    [pick],
  );

  /** いまの起点が、すでに拠点として保存されているか。 */
  const savedHere = origin ? findPlaceAt(places, origin) : undefined;

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

      {/*
        地図に重ねるのは「地図の一部」だけにする。ピン・現在地の印・件数がそれで、
        操作ボタンは置かない（操作はパネルに集めた）。
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-3 md:pl-[21rem] lg:pl-[25rem]">
        <MapChips status={status} filter={filter} />
      </div>

      <LocateButton onClick={geo.locate} locating={geo.locating} />

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
            <p className="mt-1 text-sm leading-relaxed text-zinc-600">
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

      {offered && <UrlPlacesPrompt offered={offered} />}

      <ShelterPanel
        view={view}
        filter={filter}
        origin={origin}
        places={places}
        locateError={geo.error}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((on) => !on)}
        onShow={originState.show}
        onChangeFilter={setFilter}
        onPickAddress={pickAddress}
        onLocate={geo.locate}
        locating={geo.locating}
        onSelectPlace={selectPlace}
        onRemovePlace={removePlace}
        removedPlace={removedPlace}
        onUndoRemove={undoRemove}
        undoableOrigin={originState.undoable}
        onUndoOrigin={undoOrigin}
        onSavePlace={
          origin && !savedHere && places.length < MAX_PLACES
            ? () => setSaving(true)
            : undefined
        }
        // 保存ボタンが消える理由は2つあり、片方（上限）は言わないと分からない。
        saveFull={Boolean(origin) && !savedHere && places.length >= MAX_PLACES}
        onShare={() => setSharing(true)}
        onFocus={focus}
      />
    </div>
  );
}
