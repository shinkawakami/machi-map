import {
  decodePlaces,
  encodePlaces,
  type Place,
  placesHash,
  PLACES_PARAM,
  readPlacesParam,
} from "@/lib/places";

/**
 * 拠点の**置き場所**（URL のフラグメントと localStorage）の読み書き。
 *
 * 正本は URL、localStorage はその写し。理由は src/lib/places.ts の冒頭を参照。
 * ここは window に触るので、ブラウザでしか呼べない。
 */

const STORAGE_KEY = "wagaya-nigesaki:places";

/** キャッシュを読む。消えていること・読めないことを前提に、失敗は空で返す。 */
export function readCachedPlaces(): Place[] {
  try {
    return decodePlaces(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeCachedPlaces(places: Place[]): void {
  try {
    if (places.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, encodePlaces(places));
  } catch {
    // プライベートブラウジングなどで書けなくても、URL 側が正本なので困らない。
  }
}

/**
 * URL のフラグメント（`#s=...`）から読む。クエリ（`?s=...`）ではない理由は
 * src/lib/places.ts の placesHash を参照（フラグメントはサーバーに送られない）。
 */
export function readPlacesFromUrl(): Place[] {
  return decodePlaces(readPlacesParam(window.location.hash));
}

/** 家族に送る URL。いまのページではなく、必ず地図のトップを指す。 */
export function shareUrl(places: Place[]): string {
  return `${window.location.origin}/${placesHash(places)}`;
}

/**
 * URL を書き換える。履歴は積まない（戻るボタンで拠点が消えたり戻ったりすると、
 * 何が起きたのか分からなくなる）。
 */
export function syncUrl(places: Place[]): void {
  const hash = places.length ? `#${PLACES_PARAM}=${encodePlaces(places)}` : "";
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  );
}
