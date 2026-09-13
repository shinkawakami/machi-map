import {
  MAX_PLACES,
  type Place,
  readCachedPlaces,
  readPlacesFromUrl,
  samePlaces,
  syncUrl,
  writeCachedPlaces,
} from "@/lib/places";

/**
 * 拠点の置き場。**React の state ではなく、URL と localStorage のほうが本体**なので、
 * 外部ストアとして持って `useSyncExternalStore` で読む。
 *
 * 起動時の読み込みを effect の中で setState する形にすると、
 * サーバー側の描画（拠点が無い状態）との食い違いと、カスケードした再描画が出る。
 * 読む先が外にあるものは、外にあるまま扱う。
 */

export type PlacesSnapshot = {
  places: Place[];
  /**
   * URL で届いたが、この端末の保存と食い違っているもの。
   * **黙って上書きしない。** 送られた URL を開いただけで自分の拠点が消えるのは事故。
   */
  offered: Place[] | null;
  /** この端末に書き戻してよいか。「今回だけ見る」を選ばれたら false */
  persist: boolean;
};

const EMPTY: PlacesSnapshot = { places: [], offered: null, persist: true };

let snapshot: PlacesSnapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

/** サーバー側では読めない。空から始めて、購読が始まった時点で読み直す。 */
export function getServerSnapshot(): PlacesSnapshot {
  return EMPTY;
}

export function getSnapshot(): PlacesSnapshot {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  if (!initialized) {
    initialized = true;
    snapshot = load();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(): PlacesSnapshot {
  const fromUrl = readPlacesFromUrl();
  const cached = readCachedPlaces();

  // URL が正本。入っていればそれを使う。
  if (fromUrl.length === 0) return { ...EMPTY, places: cached };
  if (cached.length === 0 || samePlaces(fromUrl, cached)) {
    return { ...EMPTY, places: fromUrl };
  }
  // 食い違ったときだけ聞く。それまではこの端末の保存を出しておく。
  return { places: cached, offered: fromUrl, persist: true };
}

function commit(next: PlacesSnapshot): void {
  snapshot = next;
  syncUrl(next.places);
  if (next.persist) writeCachedPlaces(next.places);
  for (const listener of listeners) listener();
}

/**
 * 拠点を足す。同じ名前と同じ地点は置き換える（「自宅」が2つある状態を作らない）。
 * 上限を超えたら古いものから落とす。
 */
export function savePlace(place: Place): void {
  const rest = snapshot.places.filter(
    (p) =>
      p.name !== place.name && !(p.lat === place.lat && p.lng === place.lng),
  );
  commit({
    ...snapshot,
    places: [...rest, place].slice(-MAX_PLACES),
    persist: true,
  });
}

export function removePlace(name: string): void {
  commit({
    ...snapshot,
    places: snapshot.places.filter((p) => p.name !== name),
    persist: true,
  });
}

/** URL で届いた拠点を採る。persist=false なら、この端末には書かない。 */
export function acceptOffered(persist: boolean): void {
  if (!snapshot.offered) return;
  commit({ places: snapshot.offered, offered: null, persist });
}

/** URL のほうを捨てて、この端末の拠点を使う。URL も書き戻して食い違いを消す。 */
export function keepCurrent(): void {
  commit({ ...snapshot, offered: null });
}

/*
  ここから下は「URL に入っている拠点をそのまま読む」だけの口。
  印刷用のページのように、この端末の保存とは関係なく
  **渡された URL の中身を出す**画面で使う。
*/

const NO_PLACES: Place[] = [];
let urlCache: { key: string; places: Place[] } = { key: "\u0000", places: NO_PLACES };

export function subscribeUrlPlaces(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** useSyncExternalStore に渡すので、同じ URL なら同じ配列を返す。 */
export function getUrlPlaces(): Place[] {
  const key = window.location.hash;
  if (key !== urlCache.key) urlCache = { key, places: readPlacesFromUrl() };
  return urlCache.places;
}

export function getServerUrlPlaces(): Place[] {
  return NO_PLACES;
}
