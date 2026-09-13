import type { Map as MapLibreMap } from "maplibre-gl";

import { POINT_LAYERS, ZOOM_STEP } from "@/features/map/map-style";
import type { ShelterSource } from "@/features/map/shelter-source";
import type { LatLng } from "@/lib/geo";

/**
 * 地図を押したときに何が起きるか。
 *
 * ハンドラは地図を作るときに一度だけ結ぶが、中で呼ぶ処理は描画のたびに
 * 新しくなる（起点の決め方が拠点の一覧に依存するため）。
 * **控え（ref）越しに読む**ことで、結び直さずに最新のものを呼ぶ。
 */
export type MapInteractions = {
  /** 避難場所の点を押した */
  onSelectPoint: (id: string, at: LatLng) => void;
  /** 何もない場所を押した＝そこを起点にする */
  onPickSpot: (at: LatLng) => void;
};

export function attachInteractions(
  map: MapLibreMap,
  source: ShelterSource,
  handlers: { current: MapInteractions },
): void {
  // 詳細は吹き出しではなく下段のパネルに出す。スマホで指と吹き出しが
  // 重なるのを避けたいのと、近い順の一覧と表示を使い回せるため。
  map.on("click", POINT_LAYERS, (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const { id } = feature.properties as { id: string };
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    handlers.current.onSelectPoint(id, { lat, lng });
  });

  /*
    地図を押したときの意味は、**避難場所が出ているかどうかで変える**。

    広い画面で押した1点は精度が出ないので、そこにピンを置いても直す手間が増える。
    出ていないうちは「押した場所に寄る」だけにして、避難場所が見えてから置く。
    「適当に押す → 寄る → もう一度押す → 置く」で、ドラッグは最後の数十 m だけになる。

    出ているかどうかを基準にすると、**置ける状態なら必ず避難場所が見えている**。
    ズームの数字で切ると、件数しだいで「押せるのに何も見えない」が起きる。

    避難場所の点の上を押したときは、こちらではなく詳細（上のハンドラ）が拾う。
  */
  map.on("click", (event) => {
    const { lat, lng } = event.lngLat;

    // 避難場所がまだ出ていない＝広すぎる。押した場所に寄るだけにする。
    if (!source.pointsShown()) {
      map.easeTo({
        center: [lng, lat],
        zoom: map.getZoom() + ZOOM_STEP,
        duration: 400,
      });
      return;
    }

    // 点の上を押したときは詳細を開く側に任せる。
    if (map.queryRenderedFeatures(event.point, { layers: POINT_LAYERS }).length) {
      return;
    }

    // 置くときは地図を動かさない。押した場所が目の前にあるのに、
    // 勝手に寄ったり中央に寄せたりすると、どこを押したのか見失う。
    handlers.current.onPickSpot({ lat, lng });
  });

  map.on("mouseenter", POINT_LAYERS, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", POINT_LAYERS, () => {
    map.getCanvas().style.cursor = source.baseCursor();
  });
}
