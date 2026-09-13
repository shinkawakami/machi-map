import { cachedJson, errorJson } from "@/lib/http-cache";
import { fetchShelters, parseBbox, parseCells, parseFilter } from "@/lib/shelters";

/**
 * GET /api/shelters?bbox=west,south,east,north&cells=16&kinds=EMERGENCY,SHELTER&disaster=flood
 *
 * 表示範囲に入る避難場所を返す。件数が多いときはサーバー側で
 * グリッド集約したクラスタを返す（判定は lib/shelters.ts）。
 *
 * bbox 以外の引数は不正でも 400 にせず既定に落とす。地図が出ないほうが損なので。
 *
 * 応答は CDN に置く（lib/http-cache.ts）。当たるかどうかは**呼ぶ側しだい**で、
 * クライアントは bbox を格子に吸着させてから投げてくる（lib/grid.ts の snapBbox）。
 * 生のビューポートのままだと 1px パンごとに別の URL になり、まず当たらない。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const bbox = parseBbox(params.get("bbox"));
  if (!bbox) {
    return errorJson(
      "bbox は west,south,east,north の4つの数値で指定してください",
      400,
    );
  }

  const result = await fetchShelters(
    bbox,
    parseCells(params.get("cells")),
    parseFilter(params),
  );
  return cachedJson(result);
}
