"use client";

import Link from "next/link";
import { useState } from "react";

import { useUrlPlaces } from "@/client/places-store";
import { shareUrl } from "@/client/places-url";
import PrintSheet from "@/features/places/PrintSheet";
import { placesHash } from "@/lib/places";

/**
 * 印刷用の紙。拠点は URL のフラグメントから読む。
 *
 * フラグメントはサーバーに送られないので、この画面はクライアントで組む。
 * 「自宅の位置をサーバーに渡さない」という決めごとの、そのままの帰結
 * （src/lib/places.ts の placesHash を参照）。
 */
export default function PrintPage() {
  const places = useUrlPlaces();
  /**
   * 表が全部そろったか。**そろうまで刷らせない。**
   * 取得の途中で押せると「調べています…」がそのまま紙に出る。
   */
  const [ready, setReady] = useState(false);
  const canPrint = ready && places.length > 0;

  return (
    <div className="min-h-dvh overflow-y-auto bg-white">
      <div className="no-print flex items-center gap-2 border-b border-zinc-200 px-4 py-2">
        <Link
          href="/"
          className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
        >
          ← 地図に戻る
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!canPrint}
          className="ml-auto min-h-9 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white disabled:opacity-50"
        >
          {ready ? "印刷する" : "調べています…"}
        </button>
      </div>

      <PrintSheet
        // 拠点が入れ替わったら作り直す（取得済みの表を引きずらない）。
        key={placesHash(places)}
        places={places}
        url={places.length ? shareUrl(places) : ""}
        onReady={setReady}
      />
    </div>
  );
}
