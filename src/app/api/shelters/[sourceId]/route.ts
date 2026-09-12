import { fetchDetail } from "@/lib/shelter-detail";

/**
 * GET /api/shelters/<共通ID>
 *
 * 1つの指定の中身を返す。地図の点は転送量のために名前と種別しか持っていないので、
 * 押されたときにここで残りを取る。
 *
 * 識別子は共通ID（sourceId）。Shelter.id は取り込みのたびに変わるので外には出さない。
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/shelters/[sourceId]">,
) {
  const { sourceId } = await ctx.params;

  const detail = await fetchDetail(sourceId);
  if (!detail) {
    return Response.json({ error: "見つかりませんでした" }, { status: 404 });
  }

  return Response.json(detail);
}
