"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import PrintSheet from "@/components/PrintSheet";
import { shareUrl } from "@/lib/places";
import {
  getServerUrlPlaces,
  getUrlPlaces,
  subscribeUrlPlaces,
} from "@/lib/places-store";

/**
 * 印刷用の紙。拠点は URL のフラグメントから読む。
 *
 * フラグメントはサーバーに送られないので、この画面はクライアントで組む。
 * 「自宅の位置をサーバーに渡さない」という決めごとの、そのままの帰結
 * （lib/places.ts の readPlacesFromUrl を参照）。
 */
export default function PrintPage() {
  const places = useSyncExternalStore(
    subscribeUrlPlaces,
    getUrlPlaces,
    getServerUrlPlaces,
  );

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
          className="ml-auto rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          印刷する
        </button>
      </div>

      <PrintSheet
        places={places}
        url={places.length ? shareUrl(places) : ""}
      />
    </div>
  );
}
