import { cachedJson, errorJson } from "@/lib/http-cache";
import { parseLatLng } from "@/lib/nearby";
import { fetchPlaceSummary } from "@/lib/place-summary";

/**
 * GET /api/shelters/summary?lat=35.68&lng=139.76
 *
 * 拠点1つぶんの「8種の災害 × それぞれの最寄り」と、指定避難所の最寄りを返す。
 * 絞り込みは受け取らない。**8種すべてを出すこと自体が答え**なので。
 */
export async function GET(request: Request) {
  const center = parseLatLng(new URL(request.url).searchParams);
  if (!center) {
    return errorJson("lat と lng を数値で指定してください", 400);
  }

  return cachedJson(await fetchPlaceSummary(center));
}
