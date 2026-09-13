import { type Bbox, clamp, type LatLng, snapCells } from "@/lib/geo";

/**
 * クエリ文字列を読む。**公開 API の入口はここだけを通す。**
 *
 * 絞り込み（kinds / disaster / welfare）の読み取りは src/lib/filter.ts にある。
 * あちらは書く側（ブラウザ）と同じ場所に置きたいので分けてある。
 */

/** 件数の既定と上限。近い順と住所検索で同じものを使う。 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * `limit` を読む。
 *
 * `Number(null)` も `Number("")` も 0 になる。0 は有限なのでそのまま通り、
 * 下の clamp で 1 に丸められる。**省略されたときに1件しか返らない**ので、
 * 数に変換する前に「指定が無い」を弾く。
 */
export function parseLimit(
  raw: string | null,
  fallback = DEFAULT_LIMIT,
  max = MAX_LIMIT,
): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(clamp(n, 1, max));
}

export function parseLatLng(params: URLSearchParams): LatLng | null {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** `west,south,east,north`。範囲外・逆転・NaN は null を返して 400 にする。 */
export function parseBbox(raw: string | null): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;

  const [w, s, e, n] = parts;
  const west = clamp(w, -180, 180);
  const east = clamp(e, -180, 180);
  const south = clamp(s, -90, 90);
  const north = clamp(n, -90, 90);
  if (west >= east || south >= north) return null;

  return { west, south, east, north };
}

/**
 * 横方向をいくつのセルに割るか。クライアントの画面幅から決まるので受け取る。
 *
 * 受け取った値は2の冪に寄せる。クライアントは URL がキャッシュに乗るよう
 * snapCells を通してから送ってくるので、手で組んだ URL でも同じ結果になるように
 * こちらでも同じ丸めをかける。
 */
export function parseCells(raw: string | null): number {
  return snapCells(Number(raw));
}
