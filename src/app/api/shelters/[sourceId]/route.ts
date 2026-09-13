import { cachedJson, errorJson } from "@/server/http-cache";
import { fetchDetail } from "@/server/shelter-detail";

/**
 * GET /api/shelters/<共通ID>
 *
 * 1つの指定の中身を返す。地図の点は転送量のために名前と種別しか持っていないので、
 * 押されたときにここで残りを取る。
 *
 * 識別子は共通ID（sourceId）。Shelter.id は取り込みのたびに変わるので外には出さない。
 *
 * **もともとキャッシュに最も向いた形。** 14桁の共通IDは有限（約20万）で、
 * 丸める必要がなく、取り込みの間は中身も変わらない。
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/shelters/[sourceId]">,
) {
  const { sourceId } = await ctx.params;

  const detail = await fetchDetail(sourceId);
  if (!detail) {
    return errorJson("見つかりませんでした", 404);
  }

  return cachedJson(detail);
}
