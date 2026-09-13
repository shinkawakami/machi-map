import { normalizeAddress } from "@/lib/address";
import { filterParams, type ShelterFilter } from "@/lib/filter";
import { type Bbox, type LatLng, roundCoord } from "@/lib/geo";

/**
 * 公開 API の呼び出し口。**URL の組み立てをここ1か所に集める。**
 *
 * このアプリのキャッシュは全部 URL に乗っている。CDN は URL をキーにするので
 * （src/server/http-cache.ts）、**同じ問い合わせが同じ文字列にならないと効かない**。
 * 以前は地図・近い順・災害別の表・印刷がそれぞれ `fetch("/api/...")` を組み立てて
 * いて、丸め（roundCoord）や並びの正規化を1か所でも書き忘れると、そこだけ
 * キャッシュに当たらなくなる。呼ぶ側から URL 文字列そのものを見えなくする。
 *
 * 返り値の型は src/lib/shelter.ts。作る側（src/server）と同じものを読む。
 */
export const api = {
  /** 表示範囲の点。bbox は呼ぶ側が格子に吸着させてから渡す（src/lib/geo.ts） */
  shelters(bbox: Bbox, cells: number, filter: ShelterFilter): string {
    const params = filterParams(filter);
    params.set(
      "bbox",
      [bbox.west, bbox.south, bbox.east, bbox.north]
        .map((n) => n.toFixed(5))
        .join(","),
    );
    params.set("cells", String(cells));
    return `/api/shelters?${params}`;
  },

  /** 起点から近い順。座標は丸めてから載せる（同じ拠点が同じ URL に落ちる） */
  nearby(origin: LatLng, filter: ShelterFilter): string {
    const params = filterParams(filter);
    params.set("lat", String(roundCoord(origin.lat)));
    params.set("lng", String(roundCoord(origin.lng)));
    return `/api/shelters/nearby?${params}`;
  },

  /** 拠点ごとの「8種 × 最寄り」。絞り込みは載せない（8種すべてを出すのが答え） */
  summary(origin: LatLng): string {
    return `/api/shelters/summary?lat=${roundCoord(origin.lat)}&lng=${roundCoord(origin.lng)}`;
  },

  /** 1つの指定の中身。14桁の共通IDは有限なので、丸める必要がない */
  detail(id: string): string {
    return `/api/shelters/${encodeURIComponent(id)}`;
  },

  /**
   * 住所の候補。正規化してから投げる。
   * サーバー側でも同じ関数を通すので結果は変わらず、表記ゆれ（全角半角・
   * ヶとケ・区切りの空白）のぶんだけ URL が寄ってキャッシュに当たりやすくなる。
   */
  geocode(query: string): string {
    return `/api/geocode?q=${encodeURIComponent(normalizeAddress(query))}`;
  },
} as const;

/**
 * JSON を取る。**失敗は必ず日本語の1文にして投げ直す。**
 * 呼ぶ側（画面）はそのまま出すだけにしたいので、ここで形をそろえる。
 */
export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
  return (await res.json()) as T;
}

/** 例外を、画面に出せる1文にする。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "読み込みに失敗しました";
}
