import { parseLimit, searchAddress } from "@/lib/geocode";

/**
 * GET /api/geocode?q=千代田区内幸町&limit=10
 *
 * 住所（町丁目まで）から候補を返す。外部のジオコーディング API は使わず、
 * 国土交通省「位置参照情報」を取り込んだ自前のテーブルを引く。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  return Response.json(
    await searchAddress(query, parseLimit(params.get("limit"))),
  );
}
