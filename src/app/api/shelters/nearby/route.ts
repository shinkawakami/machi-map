import { fetchNearby, parseLatLng, parseLimit } from "@/lib/nearby";
import { parseFilter } from "@/lib/shelters";

/**
 * GET /api/shelters/nearby?lat=&lng=&limit=20&kinds=EMERGENCY,SHELTER&disaster=flood
 *
 * 指定地点から近い順に返す。件数が揃うまでサーバー側で半径を広げる（lib/nearby.ts）。
 * 絞り込みの引数は /api/shelters と同じものを受ける。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const center = parseLatLng(params);
  if (!center) {
    return Response.json(
      { error: "lat と lng を数値で指定してください" },
      { status: 400 },
    );
  }

  const result = await fetchNearby(
    center,
    parseLimit(params.get("limit")),
    parseFilter(params),
  );
  return Response.json(result);
}
