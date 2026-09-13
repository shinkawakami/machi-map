import type { Map as MapLibreMap } from "maplibre-gl";

import type { LatLng } from "@/lib/geo";

/**
 * 起点がパネルに隠れない位置へ置き直す。
 *
 * パネルは狭い画面では下から、広い画面では左から出るので、避ける向きも変える。
 * 判定は Tailwind の md（768px）とそろえる。
 */
export function liftAboveSheet(
  map: MapLibreMap,
  target: LatLng,
  zoom?: number,
  instant = false,
): void {
  const container = map.getContainer();
  const wide = container.clientWidth >= WIDE_PX;
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

/**
 * パネルが下から出るか左から出るかの境目。Tailwind の md。
 *
 * 畳める／畳めないの境目も同じ値。**ここを2か所に書かない。**
 * 食い違うと、畳んだまま広い画面に変わったときに開くボタンが消えて、
 * 検索も絞り込みも保存も出せないまま戻せなくなる。
 */
export const WIDE_PX = 768;
export const WIDE_QUERY = `(min-width: ${WIDE_PX}px)`;

/** 点1つぶんの FeatureCollection（選択の輪に渡す）。 */
export function pointFeatures(point: LatLng | null): GeoJSON.FeatureCollection {
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
