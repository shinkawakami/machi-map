import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import { api, errorMessage, fetchJson } from "@/client/api";
import {
  CLUSTER_CELL_PX,
  emptyFeatures,
  SOURCE_ID,
} from "@/features/map/map-style";
import type { ShelterFilter } from "@/lib/filter";
import { snapBbox, snapCells } from "@/lib/geo";
import type { SheltersResult } from "@/lib/shelter";

/**
 * 地図に出す点の取得。**見えている範囲が変わるたびに引き直す係。**
 *
 * React の外（MapLibre のイベント）で動くので、部品の中ではなくここに置く。
 * 画面に出す状態だけを onStatus で返す。
 */
export type MapStatus =
  /** 範囲が広すぎて、サーバーが点ではなく集計を返した状態 */
  | { state: "tooWide" }
  | { state: "loading" }
  | { state: "ready"; result: SheltersResult }
  | { state: "error"; message: string };

export type ShelterSource = {
  /** いま取り直す（絞り込みや起点が変わったとき） */
  reload: () => void;
  /**
   * いま避難場所の点が地図に出ているか。
   * **地図を押したときの意味（置く／寄る）をこれで決める。**
   */
  pointsShown: () => boolean;
  /** 地図の既定のカーソル。点の上から離れたときに戻す先 */
  baseCursor: () => string;
  dispose: () => void;
};

/** 慣性スクロールの途中で何度も投げないよう、止まってから待つ時間（ms）。 */
const SETTLE_MS = 200;

export function createShelterSource(
  map: MapLibreMap,
  getFilter: () => ShelterFilter,
  onStatus: (status: MapStatus) => void,
): ShelterSource {
  let disposed = false;
  let pointsShown = false;
  let baseCursor = "";
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const load = async () => {
    const bounds = map.getBounds();

    /*
      **見えている範囲そのままでは投げない。** 格子に吸着させてから投げる。
      生のビューポートを載せると 1px パンするだけで別の URL になり、
      CDN にもブラウザのキャッシュにも当たらない（src/lib/geo.ts）。
      吸着させると、格子1つぶんの中で動いているあいだは URL が変わらず、
      そもそも取りに行かなくなる（同じ URL なので max-age の 5 分は
      ブラウザが返す）。cells も画面幅がそのまま出ないよう2の冪に寄せる。
    */
    const bbox = snapBbox({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    });
    const cells = snapCells(map.getContainer().clientWidth / CLUSTER_CELL_PX);

    controller?.abort();
    const current = new AbortController();
    controller = current;
    onStatus({ state: "loading" });

    try {
      const result = await fetchJson<SheltersResult>(
        api.shelters(bbox, cells, getFilter()),
        current.signal,
      );
      if (disposed) return;

      /*
        **点が出ているかどうかを、地図を押したときの意味とそろえる。**
        押せば置ける状態なのに避難場所が見えない、という食い違いを無くす。
        点が出るかどうかはズームではなく件数で決まる（同じ z12 でも都心と
        地方で違う）ので、ズームの数字ではなく実際の結果で判定する。

        **読み込みを始める時点では倒さない。** ここは「いま地図に描かれているもの」を
        表す旗で、「いま取りにいっているもの」ではない。点を消すのは下の setData
        なので、応答が返るまで画面には前の点が出たままになる。
        投げる前に false にしていたころは、その待ち時間のあいだ
        **見えている点を押しても置けず、代わりに拡大していた**。
        moveend のたびに読み直すので、パンや拡大の直後は毎回この窓に入る。
        ローカルでは 15〜35ms で閉じるが、本番は Vercel → Neon（Singapore）の
        往復ぶん開くため、そちらでだけ再現した。
      */
      pointsShown = result.mode === "points";
      // 押せば置ける状態なら crosshair、寄るだけなら zoom-in。
      // 起点の有無ではなく点の有無で決める（クリックの分岐と同じ基準）。
      baseCursor = pointsShown ? "crosshair" : "zoom-in";
      map.getCanvas().style.cursor = baseCursor;

      map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(
        result.mode === "points" ? toFeatures(result) : emptyFeatures(),
      );

      onStatus(
        result.mode === "clusters"
          ? { state: "tooWide" }
          : { state: "ready", result },
      );
    } catch (error) {
      if (current.signal.aborted || disposed) return;
      onStatus({ state: "error", message: errorMessage(error) });
    }
  };

  const reload = () => {
    void load();
  };

  const onMoveEnd = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(reload, SETTLE_MS);
  };

  map.on("moveend", onMoveEnd);
  reload();

  return {
    reload,
    pointsShown: () => pointsShown,
    baseCursor: () => baseCursor,
    dispose() {
      disposed = true;
      map.off("moveend", onMoveEnd);
      if (timer) clearTimeout(timer);
      controller?.abort();
    },
  };
}

function toFeatures(
  result: Extract<SheltersResult, { mode: "points" }>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: result.points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        kind: p.kind,
        // undefined は properties から落ちるので、必ず真偽値で入れる。
        both: p.both === true,
      },
    })),
  };
}
