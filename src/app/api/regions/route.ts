import { listRegions } from "@/lib/regions";

/**
 * GET /api/regions
 *
 * 都道府県 → 市区町村の一覧と、それぞれの外接矩形を返す。
 * 「地図から選ぶ」で名前から寄るために使う。
 *
 * 中身が変わるのは月1回の取り込みのときだけなので、長めにキャッシュさせる。
 */
export async function GET() {
  const regions = await listRegions();
  return Response.json(regions, {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
