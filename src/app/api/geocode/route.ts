import { GEOCODE_LIMIT, searchAddress } from "@/server/geocode";
import { cachedJson } from "@/server/http-cache";
import { parseLimit } from "@/server/params";

/**
 * GET /api/geocode?q=千代田区内幸町&limit=10
 *
 * 住所（町丁目まで）から候補を返す。外部のジオコーディング API は使わず、
 * 国土交通省「位置参照情報」を取り込んだ自前のテーブルを引く。
 *
 * `q` は打った文字列そのものなので、キーの種類は他の API より多い。それでも
 * 入力は頭に偏るし、呼ぶ側が normalizeAddress を通してから投げてくるので
 * 表記ゆれのぶんは寄る（「旭ヶ丘」と「旭ケ丘」、全角半角、区切りの空白）。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  return cachedJson(
    await searchAddress(query, parseLimit(params.get("limit"), GEOCODE_LIMIT, 20)),
  );
}
