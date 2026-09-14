"use client";

import { api } from "@/client/api";
import { useResource } from "@/client/use-resource";
import ShelterDetailView from "@/features/panel/ShelterDetailView";
import { Message } from "@/features/panel/parts";
import type { PlaceDetail } from "@/lib/shelter";

/**
 * 1つの指定の中身。
 *
 * 地図の点は転送量のために名前と種別しか持っていないので、押されてから取る
 * （src/lib/shelter.ts の ShelterPoint）。
 */
export default function DetailPane({ id }: { id: string }) {
  return (
    <div className="px-4 py-3">
      <Body id={id} />
    </div>
  );
}

/**
 * 一覧・表の行の中に出す詳細。画面を切り替えずに、そのまま次の行へ移れる。
 *
 * **上の行が出しているものは、もう一度出さない。** 行には施設名が 15px の太字で
 * 出ていて、そのすぐ下に詳細の見出しが 16px の太字で同じ名前を繰り返していた。
 * 1行おいて同じ字が2回出るので、開いた人には「また場所が出てきた」と映る。
 * 狭いパネルでは、その重複が実際の中身（種別・経路・指定ごとの項目）を
 * 下へ押しやってもいる。
 *
 * **何が行に出ているかは、行によって違う。** だから呼ぶ側が知らせる。
 * 「近い順」の行は災害種別を出していて住所は出していないし、災害別の表でも
 * 「近くにありません」の行は名前を見出しにしていない（下の1行に回している）。
 * ここで一律に省くと、名乗るものが1つも無い詳細ができる。
 */
export function InlineDetail({
  id,
  nameShown = false,
  addressShown = false,
}: {
  id: string;
  /** 上の行が施設名を見出しに出しているか */
  nameShown?: boolean;
  /** 上の行が住所を出しているか */
  addressShown?: boolean;
}) {
  return (
    <div className="border-y border-zinc-100 bg-zinc-50/70 px-4 py-3">
      <Body id={id} inline omitName={nameShown} omitAddress={addressShown} />
    </div>
  );
}

function Body({
  id,
  inline = false,
  omitName = false,
  omitAddress = false,
}: {
  id: string;
  inline?: boolean;
  omitName?: boolean;
  omitAddress?: boolean;
}) {
  const { data, error } = useResource<PlaceDetail>(api.detail(id));

  if (error) return <Message>{error}</Message>;
  if (!data) return <Message>読み込み中…</Message>;

  return (
    <ShelterDetailView
      detail={data}
      inline={inline}
      omitName={omitName}
      omitAddress={omitAddress}
    />
  );
}
