import { MY_LOCATION_COLOR, PICKED_COLOR } from "@/features/map/map-style";

/**
 * 地図に載せる HTML マーカーの中身。
 *
 * 地理院タイルはラスタでグリフを持たず symbol レイヤーが使えないので、
 * ピンも拠点の印も現在地も DOM で描く。MapLibre の Marker に渡す要素を作るだけで、
 * 地図そのものには触らない。
 */

/**
 * 起点のピン。
 *
 * **避難場所の点と取り違えられない形と大きさにする。** 点は半径 3〜10px の丸で、
 * 同じくらいの大きさの丸を置くと、色しか手がかりが無くなる。
 * 地面に刺さった軸を持つ縦長の形にして、幅も倍以上にした。
 * 先端（下端の中央）がそのまま座標を指すので、anchor は bottom で合う。
 */
const PIN_WIDTH = 30;
const PIN_HEIGHT = 42;

export function pinElement(): HTMLElement {
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

/**
 * 起点になっていない拠点の印。名前が出ていないと、どれが自宅でどれが職場か分からない。
 * 起点のピンより小さく・薄くして、いま見ている拠点との差を付ける。
 */
export function placeElement(name: string, onClick: () => void): HTMLElement {
  return labelledMarker({
    label: name,
    ariaLabel: `${name}に切り替える`,
    // 印の中心を座標に合わせる（anchor:left なので左端が座標）。
    offsetX: -9,
    svg: [
      `<svg width="18" height="18" viewBox="0 0 18 18" style="flex:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.35))">`,
      `<path d="M9.0 1.0L11.1 6.2L16.6 6.5L12.3 10.1L13.7 15.5L9.0 12.5L4.3 15.5L5.7 10.1L1.4 6.5L6.9 6.2Z" fill="${PICKED_COLOR}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>`,
      "</svg>",
    ].join(""),
    onClick,
  });
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
export function myLocationElement(onClick: () => void): HTMLElement {
  return labelledMarker({
    label: "現在地",
    ariaLabel: "現在地に戻す",
    // 記号の中心を座標に合わせる（anchor:left なので左端が座標）。
    offsetX: -11,
    svg: [
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
    ].join(""),
    onClick,
  });
}

/**
 * 記号＋名前の押せる印。拠点と現在地で同じ組みにする。
 *
 * **記号だけにしない。** 拠点は名前が無いとどれがどれか分からないし、
 * 照準の記号も、それを知らない人には手がかりにならない
 * （地図右上の「現在地」ボタンに文字を添えたのと同じ理由）。
 */
function labelledMarker({
  label,
  ariaLabel,
  offsetX,
  svg,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  /** 記号の中心を座標に重ねるための、左向きのずらし幅（px） */
  offsetX: number;
  svg: string;
  onClick: () => void;
}): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", ariaLabel);
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:4px",
    "padding:0",
    "background:none",
    "border:none",
    "cursor:pointer",
    `transform:translateX(${offsetX}px)`,
  ].join(";");

  el.innerHTML =
    svg +
    `<span style="padding:1px 6px;border-radius:9999px;background:rgba(255,255,255,0.92);border:1px solid rgba(82,82,91,0.25);color:#27272a;font-size:11px;font-weight:600;white-space:nowrap">${label}</span>`;

  el.addEventListener("click", onClick);
  return el;
}
