import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

import { kindOf } from "@/lib/kinds";

/**
 * 地図そのものの見た目。**色と形の決めごとはここ1か所に置く。**
 *
 * 避難場所の点・両方の指定のリング・選択の輪・ピン・現在地の印は、
 * 互いに見分けがつくことが前提で成り立っている。別々のファイルに散らすと、
 * 片方だけ色を変えて「取り違えられない」が崩れる。
 */

/**
 * 背景地図は地理院タイル（淡色地図）。避難場所の点を載せるので、
 * 情報量の少ない淡色を使う。出典表示は利用規約上の義務なので消さない。
 */
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';

export const MAP_STYLE: StyleSpecification = {
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
export const SAMPLE_VIEW = {
  center: [139.7671, 35.6812] as [number, number],
  zoom: 13,
};

/**
 * 日本の外に出ても意味がないので止める。ただし**大きく取る**こと。
 * maxBounds が表示範囲より狭いと、MapLibre はカメラのほうを黙って動かして
 * 収めにいく。最初これを 110-165°E（55°幅）にしていたら、全国を収めるはずの
 * fitBounds が上書きされて北海道と沖縄が切れた。
 * 「はみ出せる限界」ではなく「どのズームでも表示範囲より広い箱」を書く。
 */
export const MAX_BOUNDS: [[number, number], [number, number]] = [
  [95, 5],
  [180, 60],
];

/**
 * 押して寄るときの1回ぶんの段。
 * クラスタを押したときの寄り方（+2）とそろえる。同じ地図で寄り方が2種類あると、
 * どれだけ動くかが読めない。1回で大きく飛ぶと、行き過ぎたときに戻す手間のほうが増える。
 */
export const ZOOM_STEP = 2;

/**
 * クラスタの目標セルサイズ（px）。API に渡す分割数のもとになる。
 *
 * **まとめた円は画面には描かない。** 全国の密度は、場所を決める判断にも
 * 逃げ先を知る判断にも使われない情報で、入口の主役（地図を押して場所を決める）と
 * 押す対象を取り合うだけだった。
 * サーバー側の点／クラスタ切り替えは残してある。あれは「広い範囲で3万点を返さない」
 * ための上限で、画面に出すかどうかとは別の話。
 */
export const CLUSTER_CELL_PX = 150;

export const SOURCE_ID = "shelters";
export const LAYER_ID = "shelter-points";
/**
 * 両方の指定がある場所の下敷き。点より一回り大きい青い丸を敷き、
 * 上に橙の丸を重ねて**二色の点**にする（橙の芯＋青いリング）。
 *
 * **色は増やさない。** 3色目を作ると「緊急でもあり避難所でもある」という
 * 第3の種別が実在するように読めるが、制度上そんな区分は無い。
 * 2つの指定が同じ場所にある、という事実の見た目どおりにする。
 */
export const BOTH_LAYER_ID = "shelter-points-both";

/** 選択中の避難場所。点より上に重ねる。 */
export const SELECTED_SOURCE_ID = "selected-shelter";

/** 点を押せる（＝詳細を開く）レイヤー。 */
export const POINT_LAYERS = [LAYER_ID, BOTH_LAYER_ID];

// 色は src/lib/kinds.ts が唯一の出どころ。凡例（フィルタの種別ボタン）と必ずそろえる。
const COLOR_EMERGENCY = kindOf("EMERGENCY").color;
const COLOR_SHELTER = kindOf("SHELTER").color;

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
export const PICKED_COLOR = "#f59e0b";

/**
 * 現在地の色。指定避難所の青（#1d4ed8）と紛れないよう、青緑に寄せる。
 * 形（照準）と合わせて、避難場所の点とは二重に分ける。
 */
export const MY_LOCATION_COLOR = "#0891b2";

/** 空の FeatureCollection。ソースを足すときと、中身を消すときに使う。 */
export function emptyFeatures(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/**
 * 避難場所の点と、選択の輪を地図に足す。`map.on("load")` の中から呼ぶ。
 *
 * 中身（setData で入れるもの）は呼ぶ側が面倒を見る。ここは器だけ。
 */
export function addShelterLayers(map: MapLibreMap): void {
  map.addSource(SOURCE_ID, { type: "geojson", data: emptyFeatures() });

  // リングは点より先に足す（＝下に敷く）。
  map.addLayer({
    id: BOTH_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", ["get", "both"], true],
    paint: {
      /*
        点の半径（3 / 6 / 10）に、リングぶんを足した大きさ。

        **リング幅もズームで変える**（2 / 3 / 4px）。3px 固定にしていたら、
        点が小さい低ズームでリングだけが相対的に太くなり、
        z9 で直径が 9px → 15px（面積で約2.8倍）になった。
        密なところでは点の4割前後が両方の指定なので、
        引いた画面が「大きい点＝重要」と読める絵になってしまう。
        式は addLayer の型推論に載せたいので、切り出さずここに書く。
      */
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 13, 9, 18, 14],
      "circle-color": COLOR_SHELTER,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.9,
    },
  });

  map.addLayer({
    id: LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 6, 18, 10],
      "circle-color": [
        "match",
        ["get", "kind"],
        "EMERGENCY",
        COLOR_EMERGENCY,
        COLOR_SHELTER,
      ],
      // 二色の点は、白い縁を挟まず青いリングに直接載せる。
      "circle-stroke-width": ["case", ["==", ["get", "both"], true], 0, 1.5],
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.9,
    },
  });

  // 選択中の避難場所。中身は別の effect から setData で入れる。
  map.addSource(SELECTED_SOURCE_ID, { type: "geojson", data: emptyFeatures() });
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
}
