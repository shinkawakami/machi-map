import { cachedJson, errorJson } from "@/lib/http-cache";
import { fetchNearby, parseLatLng, parseLimit } from "@/lib/nearby";
import { parseFilter } from "@/lib/shelters";

/**
 * GET /api/shelters/nearby?lat=&lng=&limit=20&kinds=EMERGENCY,SHELTER&disaster=flood
 *
 * 指定地点から近い順に返す。件数が揃うまでサーバー側で半径を広げる（lib/nearby.ts）。
 * 絞り込みの引数は /api/shelters と同じものを受ける。
 *
 * ここは疎な地域だと半径を倍々に広げるぶん**最大8往復**する。裏を返すと、
 * CDN に当たったときの得が最も大きいのもここ。呼ぶ側は座標を小数4桁に丸めて
 * 投げてくる（lib/grid.ts の roundCoord）。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const center = parseLatLng(params);
  if (!center) {
    return errorJson("lat と lng を数値で指定してください", 400);
  }

  const result = await fetchNearby(
    center,
    parseLimit(params.get("limit")),
    parseFilter(params),
  );
  return cachedJson(result);
}
