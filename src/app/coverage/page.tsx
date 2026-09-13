import type { Metadata } from "next";
import Link from "next/link";

import SiteFooter from "@/components/SiteFooter";
import { type CoverageRow, fetchCoverage, percent } from "@/lib/coverage";
import { formatCount, formatDate } from "@/lib/format";
import { KINDS } from "@/lib/kinds";

export const metadata: Metadata = {
  title: "データの公開状況 | わが家の逃げ先",
  description:
    "この地図に出ている避難場所は、市町村が登録し公開に同意したものに限られます。全国 1,700 余りの市町村について、指定緊急避難場所・指定避難所それぞれの公開状況を出しています。",
};

/**
 * 取り込みは月1回だが、このページはリクエストのたびに DB を引く。
 * 静的に固めるとビルド時に DB へ繋ぐことになり、ビルドが Neon の状態に依存する。
 * 1,747行の集計なので、都度引いても軽い。
 */
export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const coverage = await fetchCoverage();
  const { total, both, emergencyOnly, shelterOnly, none } = coverage;
  const partial = emergencyOnly.length + shelterOnly.length;

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3 py-2">
        <Link
          href="/"
          className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          ← 地図
        </Link>
        <h1 className="truncate text-sm font-semibold text-zinc-900">
          データの公開状況
        </h1>
      </header>

      {/* 地図と違いこのページは縦に伸びる。body 側が overflow-hidden なので、ここで
          スクロールを持つ。 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6">
          <section className="flex flex-col gap-3 text-[13px] leading-relaxed text-zinc-600">
            <p>
              この地図に出ているのは、
              <strong className="font-semibold text-zinc-900">
                市町村が国土地理院に登録し、公開に同意した避難場所だけ
              </strong>
              です。どこまで揃っていて、どこが欠けているのかを隠さずに出します。
            </p>
            <p>
              市町村の単位で見ると、全国 {formatCount(total)} のうち
              {formatCount(both)}（{percent(both, total)}）が両方を公開しています。
              つまり「全国が空白だらけ」ではありません。読むべきなのは、
              <strong className="font-semibold text-zinc-900">
                片方しか公開されていない {partial} 市町村
              </strong>
              のほうです。
            </p>
          </section>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="両方を公開" value={both} total={total} />
            <Stat
              label={`${KINDS[0].shortLabel}のみ`}
              value={emergencyOnly.length}
              total={total}
            />
            <Stat
              label={`${KINDS[1].shortLabel}のみ`}
              value={shelterOnly.length}
              total={total}
            />
            <Stat label="データ未登録" value={none.length} total={total} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              片方しか公開されていない市町村（{partial}）
            </h2>
            <p className="text-[13px] leading-relaxed text-zinc-600">
              「指定緊急避難場所」と「指定避難所」は別のもので、登録も別々です。
              どちらか片方だけが公開されている市町村では、
              <strong className="font-semibold text-zinc-900">
                地図にある点がその市町村のすべてではありません
              </strong>
              。とくに {KINDS[1].shortLabel}だけがある場合、
              災害のときに最初に向かうべき場所（{KINDS[0].label}）が
              この地図には出てきません。
            </p>

            <CoverageList
              title={`${KINDS[1].shortLabel}だけがある`}
              note={`${KINDS[0].label}が公開されていません`}
              color={KINDS[1].color}
              rows={shelterOnly}
            />
            <CoverageList
              title={`${KINDS[0].shortLabel}だけがある`}
              note={`${KINDS[1].label}が公開されていません`}
              color={KINDS[0].color}
              rows={emergencyOnly}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              データが登録されていない市町村（{none.length}）
            </h2>
            <p className="text-[13px] leading-relaxed text-zinc-600">
              避難場所そのものが無いわけではありません。国土地理院のこのデータに
              登録がない、という意味です。避難場所は各市町村が指定しているので、
              住んでいる市町村のウェブサイトで確認してください。
            </p>
            <CoverageList color="#a1a1aa" rows={none} />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              「北方領土」と付けた6村は、他の未登録の市町村とは事情が異なります。
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              数字で示せない欠けもあります
            </h2>
            <p className="text-[13px] leading-relaxed text-zinc-600">
              上の数字は<strong className="font-semibold text-zinc-900">市町村の単位</strong>
              の話です。市町村が公開していても、
              <strong className="font-semibold text-zinc-900">
                その中の個々の施設が公開されていないことがあります
              </strong>
              （配布元が「各市町村の希望により公開していない施設が存在する場合がございます」と
              明記しています）。これは公開されていない以上こちらからは数えられないので、
              件数では示せません。
            </p>
            <p className="text-[13px] leading-relaxed text-zinc-600">
              また、このデータは随時更新されます。最新かどうか、詳しい条件がどうなっているかは、
              必ず当該市町村に確認してください。
            </p>
          </section>

          <section className="flex flex-col gap-1 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500">
            <p>
              いま出している指定の件数: {KINDS[0].label}{" "}
              {formatCount(coverage.shelterTotals.emergency)} 件 /{" "}
              {KINDS[1].label} {formatCount(coverage.shelterTotals.shelter)} 件
            </p>
            {coverage.sourceUpdatedAt && (
              <p>
                出典データの最終更新日（市町村単位で最も新しいもの）:{" "}
                {formatDate(coverage.sourceUpdatedAt)}
              </p>
            )}
            {coverage.importedAt && (
              <p>
                このサイトへの取り込み:{" "}
                {new Intl.DateTimeFormat("ja-JP", {
                  dateStyle: "long",
                  // 取り込み時刻は timestamp なので、日本時間で読む。
                  timeZone: "Asia/Tokyo",
                }).format(coverage.importedAt)}
              </p>
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Stat({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-900">
        {formatCount(value)}
      </p>
      <p className="text-[11px] text-zinc-500">{percent(value, total)}</p>
    </div>
  );
}

function CoverageList({
  title,
  note,
  color,
  rows,
}: {
  title?: string;
  note?: string;
  color: string;
  rows: CoverageRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {title && (
        <div className="flex items-baseline gap-2 border-b border-zinc-100 px-3 py-2">
          <span
            className="size-2.5 shrink-0 translate-y-0.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[13px] font-semibold text-zinc-900">
            {title}（{rows.length}）
          </span>
          {note && <span className="text-[11px] text-zinc-500">{note}</span>}
        </div>
      )}
      <ul className="divide-y divide-zinc-100">
        {rows.map((row) => (
          <li
            key={row.code}
            className="flex items-baseline gap-2 px-3 py-1.5 text-[13px]"
          >
            <span className="text-zinc-500">{row.prefecture}</span>
            <span className="font-medium text-zinc-900">{row.name}</span>
            {row.disputed && (
              <span className="rounded border border-zinc-200 px-1 text-[10px] text-zinc-500">
                北方領土
              </span>
            )}
            <span className="ml-auto shrink-0 text-[11px] text-zinc-500">
              {KINDS[0].shortLabel} {formatCount(row.emergencyCount)} /{" "}
              {KINDS[1].shortLabel} {formatCount(row.shelterCount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
