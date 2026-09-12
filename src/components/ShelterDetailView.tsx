"use client";

import { DISASTER_TYPES } from "@/lib/disasters";
import { kindOf, KINDS } from "@/lib/kinds";
import type { ShelterDetail } from "@/lib/shelter-detail";

/**
 * 1つの指定の中身。
 *
 * 災害種別は**8種すべて**を出し、対応していないものにも×を付ける。
 * 対応するものだけ並べると「書いていない災害はどうなのか」が読み取れず、
 * このアプリが伝えたい「洪水では使えない避難場所がある」が消える。
 */
export default function ShelterDetailView({
  detail,
}: {
  detail: ShelterDetail;
}) {
  const kind = kindOf(detail.kind);
  const otherKind = KINDS.find((k) => k.key !== detail.kind)!;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[11px] text-white"
          style={{ backgroundColor: kind.color }}
        >
          {kind.label}
        </span>
        <h2 className="mt-1 text-base leading-snug font-semibold text-zinc-900">
          {detail.name}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">{detail.address}</p>
        <p className="mt-1 text-xs text-zinc-600">{kind.description}</p>
      </div>

      <section>
        <h3 className="text-xs font-semibold text-zinc-500">対応する災害</h3>
        {detail.disasters === null ? (
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            指定避難所には災害種別の指定がありません。
            災害の種類ごとに使える・使えないが分かれるのは指定緊急避難場所のほうです。
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {DISASTER_TYPES.map((disaster) => {
              const on = detail.disasters!.includes(disaster.key);
              return (
                <li
                  key={disaster.key}
                  title={disaster.sourceLabel}
                  className={`rounded border px-1.5 py-0.5 text-xs ${
                    on
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-400"
                  }`}
                >
                  {on ? "○" : "×"} {disaster.label}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {detail.targetPersons && (
        <Field label="受入対象者">{detail.targetPersons}</Field>
      )}
      {detail.otherMatters && (
        <Field label="その他市町村長が必要と認める事項">
          {detail.otherMatters}
        </Field>
      )}
      {detail.note && <Field label="備考">{detail.note}</Field>}

      {detail.sameAddressAsOther && (
        <p className="rounded bg-zinc-50 px-2 py-1.5 text-xs leading-relaxed text-zinc-600">
          同じ住所に{otherKind.label}
          の指定もあります（国土地理院のデータ上の住所が一致するという意味で、
          同じ施設とは限りません）。
        </p>
      )}

      <p className="border-t border-zinc-100 pt-2 text-[11px] leading-relaxed text-zinc-500">
        最新かつ詳細な情報は、必ず市町村にご確認ください。
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-zinc-500">{label}</h3>
      <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-wrap text-zinc-700">
        {children}
      </p>
    </section>
  );
}
