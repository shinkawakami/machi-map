import type { LatLng } from "@/lib/geo";

/**
 * 近い順の起点。**このアプリが「いま誰のために答えているか」。**
 *
 * 現在地ボタンで取ったもの（gps）・地図や住所で指したもの（picked）・
 * 保存した拠点（saved）は意味が違う。「現在地から近い順」と言い切れるのは
 * 最初のものだけなので、座標だけでなく出どころも一緒に持ち回す。
 *
 * 地図（features/map）とパネル（features/panel）の両方が扱うので、
 * どちらでもない場所に置く。
 */
export type Origin = LatLng & {
  source: "gps" | "picked" | "saved";
  /** 拠点として保存されているときの名前 */
  name?: string;
};

/** 見出しに出す起点の呼び名。拠点なら、その名前で呼ぶ。 */
export function originLabel(origin: Origin | null): string {
  if (origin?.name) return origin.name;
  return origin?.source === "picked" ? "指した地点" : "現在地";
}

/** 同じ起点か。座標と、どう決めたかがそろっていれば同じものとして扱う。 */
export function sameOrigin(a: Origin | null, b: Origin | null): boolean {
  return Boolean(
    a &&
      b &&
      a.lat === b.lat &&
      a.lng === b.lng &&
      a.source === b.source &&
      a.name === b.name,
  );
}
