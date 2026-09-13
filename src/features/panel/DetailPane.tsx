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
  const { data, error } = useResource<PlaceDetail>(api.detail(id));

  if (error) return <Message>{error}</Message>;
  if (!data) return <Message>読み込み中…</Message>;

  return (
    <div className="px-3 py-3">
      <ShelterDetailView detail={data} />
    </div>
  );
}

/** 一覧・表の行の中に出す詳細。画面を切り替えずに、そのまま次の行へ移れる。 */
export function InlineDetail({ id }: { id: string }) {
  return (
    <div className="border-y border-zinc-100 bg-zinc-50/70 px-3 py-2.5">
      <DetailPane id={id} />
    </div>
  );
}
