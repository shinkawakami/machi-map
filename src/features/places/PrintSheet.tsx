"use client";

import { useEffect, useState } from "react";

import { api, errorMessage, fetchJson } from "@/client/api";
import QrCode from "@/components/QrCode";
import { formatDistance } from "@/lib/format";
import { kindOf } from "@/lib/kinds";
import type { Place } from "@/lib/places";
import type { NearbyItem, PlaceSummary } from "@/lib/shelter";
import {
  groupSummaryRows,
  groupTitle,
  isFar,
  NEARBY_LIMIT_M,
} from "@/lib/summary";

/**
 * 拠点ごとの「8種 × 最寄り」を紙に出す。
 *
 * 災害のときにスマホが使えるとは限らないので、**紙に出ているほうが本来正しい**。
 * 調べ終わったあとに何も残らないのがこのアプリの最大の穴（.local/PLAN.md 壁4）で、
 * 冷蔵庫に貼れる紙は、その穴に対していちばん直接的な答えになる。
 *
 * QR も一緒に刷る。紙から戻ってこられないと、更新のたびに刷り直しになる。
 */
/** 1拠点ぶんの取得結果。読み終えるまでは配列そのものが無い。 */
type Loaded = { summary: PlaceSummary | null; error: string | null };

export default function PrintSheet({
  places,
  url,
  onReady,
}: {
  places: Place[];
  /** 拠点が入った URL。QR の中身 */
  url: string;
  /**
   * 全部の拠点を引き終えたか。**紙は刷り直しがきかない**ので、
   * 取得の途中で「印刷する」を押せると「調べています…」がそのまま紙に出る。
   * ボタンを持っているのはページ側なので、状態だけ渡す。
   */
  onReady?: (ready: boolean) => void;
}) {
  /*
    取得は**ここでまとめてやる**（拠点ごとの表に散らさない）。
    散らしたままだと「全部終わったか」を誰も知らず、ページ側のボタンを
    止められなかった。並列に投げるのは変わらない。

    拠点が入れ替わったときの取り直しは、ページ側が key を替えて作り直す。
    ここで results を null に戻すと、effect の中の setState になる。
  */
  const [results, setResults] = useState<Loaded[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      const loaded = await Promise.all(
        places.map(async (place): Promise<Loaded> => {
          try {
            // 画面で見たときと同じ URL になる（src/client/api.ts が丸めを通す）。
            const summary = await fetchJson<PlaceSummary>(
              api.summary(place),
              controller.signal,
            );
            return { summary, error: null };
          } catch (e) {
            return { summary: null, error: errorMessage(e) };
          }
        }),
      );
      if (!cancelled) setResults(loaded);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [places]);

  // 1件でも落ちたときは、落ちたことごと刷る。待ち続けても紙は出ない。
  useEffect(() => {
    onReady?.(results !== null);
  }, [results, onReady]);

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
        places.map((place, index) => (
          <PlaceTable key={place.name} place={place} result={results?.[index]} />
        ))
      )}

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[10px] leading-relaxed text-zinc-500">
        出典：国土地理院ウェブサイト（指定緊急避難場所データ・指定避難所データ）、
        「位置参照情報ダウンロードサービス」（国土交通省）をもとに作成。
        データは市町村が登録し公開に同意したものに限られ、最新でない場合や未掲載の場合があります。
        距離は直線距離で、実際の道のりではありません。
        「近くにありません」は、{NEARBY_LIMIT_M / 1000}km 以内にその災害で使える指定が無いという意味です。
      </footer>
    </div>
  );
}

function PlaceTable({
  place,
  result,
}: {
  place: Place;
  /** まだ読み終えていなければ undefined */
  result?: Loaded;
}) {
  const summary = result?.summary ?? null;
  const error = result?.error ?? null;

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
      {!result && <p className="mt-2 text-xs text-zinc-500">調べています…</p>}

      {summary && (
        <>
          <table className="mt-2 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-zinc-300 text-[10px] text-zinc-500">
                <th className="w-40 py-1 font-medium">災害</th>
                <th className="py-1 font-medium">
                  逃げ先（{kindOf("EMERGENCY").label}）
                </th>
                <th className="w-14 py-1 text-right font-medium">距離</th>
              </tr>
            </thead>
            {/*
              画面と同じく、同じ施設に落ちた災害は1行に束ねる（src/lib/summary.ts）。
              紙は戻って確かめられないぶん、同じ名前が8回並ぶ表はなお読みにくい。
            */}
            <tbody>
              {groupSummaryRows(summary.rows).map((group) => (
                <Row
                  key={group.item?.id ?? "missing"}
                  label={groupTitle(group)}
                  item={group.item}
                  far={group.far}
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
                far={summary.shelter ? isFar(summary.shelter) : false}
                note="災害がおさまったあと、生活する場所"
              />
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

/**
 * 表の1行。
 *
 * **遠すぎるものは答えの欄に置かない。** 半径のはしごは 256km まで伸びるので、
 * その災害の指定が自分の市町村に無いと遠くの指定が最寄りとして返る。
 * 紙の上でそれを 500m の小学校と同じ書式で並べると、貼ったまま何年も嘘をつく。
 */
function Row({
  label,
  item,
  far = false,
  note,
}: {
  label: string;
  item: NearbyItem | null;
  /** 見つかってはいるが、逃げ先と呼べる距離ではない */
  far?: boolean;
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
        {item && !far && (
          <>
            <span className="font-medium text-zinc-900">{item.name}</span>
            <span className="block text-[10px] text-zinc-500">
              {item.address}
            </span>
          </>
        )}
        {item && far && (
          <>
            <span className="font-medium text-zinc-900">近くにありません</span>
            <span className="block text-[10px] text-zinc-600">
              {`最寄りは${formatDistance(item.distanceM)}先の${item.name}（${item.address}）`}
            </span>
          </>
        )}
        {!item && (
          <>
            <span className="font-medium text-zinc-900">近くにありません</span>
            <span className="block text-[10px] text-zinc-600">
              探した範囲に、その災害で使える指定がありませんでした
            </span>
          </>
        )}
      </td>
      <td className="py-1.5 text-right font-semibold text-zinc-900 tabular-nums">
        {item && !far ? formatDistance(item.distanceM) : "—"}
      </td>
    </tr>
  );
}
