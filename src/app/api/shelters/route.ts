import { fetchShelters, parseBbox, parseCells, parseFilter } from "@/lib/shelters";

/**
 * GET /api/shelters?bbox=west,south,east,north&cells=16&kinds=EMERGENCY,SHELTER&disaster=flood
 *
 * 表示範囲に入る避難場所を返す。件数が多いときはサーバー側で
 * グリッド集約したクラスタを返す（判定は lib/shelters.ts）。
 *
 * bbox 以外の引数は不正でも 400 にせず既定に落とす。地図が出ないほうが損なので。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const bbox = parseBbox(params.get("bbox"));
  if (!bbox) {
    return Response.json(
      { error: "bbox は west,south,east,north の4つの数値で指定してください" },
      { status: 400 },
    );
  }

  const result = await fetchShelters(
    bbox,
    parseCells(params.get("cells")),
    parseFilter(params),
  );
  return Response.json(result);
}
