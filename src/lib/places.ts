/**
 * 生活拠点（自宅・職場・実家・学校）の持ち方。
 *
 * **正本は URL。localStorage はキャッシュ。**
 * Safari の ITP は「7日間そのサイトに触らないと script から書いたストレージを消す」。
 * 防災は数か月おきに開く題材なので、iPhone では「たまに消える」ではなく
 * 「基本的に消える」。クライアント保存を正本にする設計は最初から成立しない。
 * 根拠と経緯は .local/PLAN.md「拠点の保存をどうするか」を参照。
 *
 * サーバーには持たない。ログイン不要が守れるだけでなく、
 * 「自宅の位置」という重い情報を預からずに済む。
 */

export type Place = { name: string; lat: number; lng: number };

/**
 * 拠点名の候補。自由入力だけにすると「〇〇マンション301」を入れる人が出る。
 * URL は家族に送られる前提なので、既定では建物名が入らない形にしておく。
 */
export const PLACE_PRESETS = ["自宅", "職場", "実家", "学校"] as const;

/** URL に載せる数。多すぎると URL が伸び、そもそも生活範囲の数でもない。 */
export const MAX_PLACES = 6;

export const PLACES_PARAM = "s";

const MAX_NAME_LENGTH = 12;

/**
 * 座標は小数4桁（約11m）に丸める。近い順は半径2kmから広げるので精度は足りる。
 * URL が短くなり、自宅の位置をそのままの精度で配らずに済む。
 */
export function roundCoord(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * 拠点名から、URL の区切りに使う文字と、読めない文字を落とす。
 * percent-encode に頼らないのは、**送られた側が URL の中身を読めるほうが安全**だから。
 */
export function sanitizePlaceName(raw: string): string {
  return raw
    .replace(/[,;&#?%\s]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** `自宅,35.6580,139.7016;職場,35.6812,139.7671` の形にする。 */
export function encodePlaces(places: Place[]): string {
  return places
    .map((p) => `${p.name},${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join(";");
}

/** 壊れた要素は黙って捨てる。URL は人の手で編集されるし、途中で切れて届く。 */
export function decodePlaces(raw: string | null): Place[] {
  if (!raw) return [];

  const places: Place[] = [];
  for (const part of raw.split(";")) {
    const [name, lat, lng] = part.split(",");
    const place = makePlace(name ?? "", Number(lat), Number(lng));
    if (place) places.push(place);
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}

export function makePlace(
  name: string,
  lat: number,
  lng: number,
): Place | null {
  const cleaned = sanitizePlaceName(name);
  if (!cleaned) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { name: cleaned, lat: roundCoord(lat), lng: roundCoord(lng) };
}

export function samePlaces(a: Place[], b: Place[]): boolean {
  return encodePlaces(a) === encodePlaces(b);
}

/** 同じ場所を2回保存させない。丸めたあとの座標で見る。 */
export function findPlaceAt(
  places: Place[],
  point: { lat: number; lng: number },
): Place | undefined {
  const lat = roundCoord(point.lat);
  const lng = roundCoord(point.lng);
  return places.find((p) => p.lat === lat && p.lng === lng);
}

// --- 以下はブラウザでのみ呼ぶ ---

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
 * 拠点は **URL のフラグメント（`#s=...`）に置く。クエリ（`?s=...`）ではない。**
 *
 * フラグメントはサーバーに送られない。クエリに入れると、共有された URL を
 * 開いた時点でリクエスト行に自宅の座標が載り、ホスティングのアクセスログに残る。
 * 「サーバーに持たない」と言いながら、ログには持っていることになる。
 * 読むのはどのみちブラウザ側だけなので、送らない場所に置く。
 */
export function readPlacesFromUrl(): Place[] {
  return decodePlaces(readPlacesParam(window.location.hash));
}

/** `#s=自宅,35.6580,139.7016;…` から値だけ取り出す。 */
function readPlacesParam(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of raw.split("&")) {
    const [key, ...rest] = part.split("=");
    if (key === PLACES_PARAM) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** 共有・印刷で使うフラグメント。`#s=自宅,35.6580,139.7016` の形。 */
export function placesHash(places: Place[]): string {
  return places.length ? `#${PLACES_PARAM}=${encodePlaces(places)}` : "";
}

/** 家族に送る URL。いまのページではなく、必ず地図のトップを指す。 */
export function shareUrl(places: Place[]): string {
  return `${window.location.origin}/${placesHash(places)}`;
}

/**
 * URL を書き換える。履歴は積まない（戻るボタンで拠点が消えたり戻ったりすると、
 * 何が起きたのか分からなくなる）。
 *
 * 名前は percent-encode しない。区切り文字は sanitizePlaceName で落としてある。
 * **送られた側が URL の中身を読めるほうが、この題材では安全**なので。
 */
export function syncUrl(places: Place[]): void {
  const hash = places.length ? `#${PLACES_PARAM}=${encodePlaces(places)}` : "";
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  );
}
