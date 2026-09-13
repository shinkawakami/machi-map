"use client";

import { useEffect, useState } from "react";

import QrCode from "@/components/QrCode";
import { disasterLabel } from "@/lib/disasters";
import { formatDistance } from "@/lib/format";
import { kindOf } from "@/lib/kinds";
import type { NearbyItem } from "@/lib/nearby";
import type { PlaceSummary } from "@/lib/place-summary";
import type { Place } from "@/lib/places";

/**
 * 拠点ごとの「8種 × 最寄り」を紙に出す。
 *
 * 災害のときにスマホが使えるとは限らないので、**紙に出ているほうが本来正しい**。
 * 調べ終わったあとに何も残らないのがこのアプリの最大の穴（.local/PLAN.md 壁4）で、
 * 冷蔵庫に貼れる紙は、その穴に対していちばん直接的な答えになる。
 *
 * QR も一緒に刷る。紙から戻ってこられないと、更新のたびに刷り直しになる。
 */
export default function PrintSheet({
  places,
  url,
}: {
  places: Place[];
  /** 拠点が入った URL。QR の中身 */
  url: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-6 print:px-0 print:py-0">
      <header className="flex items-start gap-4 border-b border-zinc-300 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-zinc-900">
            わが家の逃げ先
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            避難場所は<strong>災害の種類ごとに使える・使えないが分かれます</strong>。
            下の表は、拠点ごとに「その災害で使える最寄り」を並べたものです。
            実際の避難では、必ず市町村の指示に従ってください。
          </p>
        </div>
        {url && (
          <div className="shrink-0 text-center">
            <QrCode value={url} size={104} />
            <p className="mt-1 text-[10px] text-zinc-500">
              この紙の元になった地図
            </p>
          </div>
        )}
      </header>

      {places.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          拠点が入っていません。地図で拠点を保存してから、もう一度開いてください。
        </p>
      ) : (
        places.map((place) => <PlaceTable key={place.name} place={place} />)
      )}

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[10px] leading-relaxed text-zinc-500">
        出典：国土地理院ウェブサイト（指定緊急避難場所データ・指定避難所データ）をもとに作成。
        データは市町村が登録し公開に同意したものに限られ、最新でない場合や未掲載の場合があります。
        距離は直線距離で、実際の道のりではありません。
      </footer>
    </div>
  );
}

function PlaceTable({ place }: { place: Place }) {
  const [summary, setSummary] = useState<PlaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/shelters/summary?lat=${place.lat}&lng=${place.lng}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`API が ${res.status} を返しました`);
        setSummary(await res.json());
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    })();

    return () => controller.abort();
  }, [place.lat, place.lng]);

  return (
    /* 拠点は紙の途中で割らない。1枚に1拠点でなくてよいが、表は切らない。 */
    <section className="mt-5 break-inside-avoid">
      <h2 className="flex items-baseline gap-2 text-base font-bold text-zinc-900">
        {place.name}
        <span className="text-[11px] font-normal text-zinc-500">
          {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
        </span>
      </h2>

      {error && <p className="mt-2 text-xs text-zinc-500">{error}</p>}
      {!error && !summary && (
        <p className="mt-2 text-xs text-zinc-500">調べています…</p>
      )}

      {summary && (
        <>
          <table className="mt-2 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-zinc-300 text-[10px] text-zinc-500">
                <th className="w-24 py-1 font-medium">災害</th>
                <th className="py-1 font-medium">
                  逃げ先（{kindOf("EMERGENCY").label}）
                </th>
                <th className="w-14 py-1 text-right font-medium">距離</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <Row
                  key={row.disaster}
                  label={disasterLabel(row.disaster)}
                  item={row.nearest}
                />
              ))}
            </tbody>
          </table>

          {/* 指定避難所は災害種別を持たない。同じ表に混ぜると読み違える。 */}
          <table className="mt-2 w-full border-collapse text-left text-xs">
            <tbody>
              <Row
                label={`${kindOf("SHELTER").label}`}
                item={summary.shelter}
                note="災害がおさまったあと、生活する場所"
              />
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Row({
  label,
  item,
  note,
}: {
  label: string;
  item: NearbyItem | null;
  note?: string;
}) {
  return (
    <tr className="border-b border-zinc-200 align-top">
      <td className="py-1.5 pr-2 font-semibold text-zinc-900">
        {label}
        {note && (
          <span className="block text-[10px] font-normal text-zinc-500">
            {note}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-2">
        {item ? (
          <>
            <span className="font-medium text-zinc-900">{item.name}</span>
            <span className="block text-[10px] text-zinc-500">
              {item.address}
            </span>
          </>
        ) : (
          <span className="text-zinc-400">
            この付近に、この災害で使える指定がありません
          </span>
        )}
      </td>
      <td className="py-1.5 text-right font-semibold text-zinc-900 tabular-nums">
        {item ? formatDistance(item.distanceM) : "—"}
      </td>
    </tr>
  );
}
