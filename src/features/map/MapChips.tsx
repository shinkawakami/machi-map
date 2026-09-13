"use client";

import type { MapStatus } from "@/features/map/shelter-source";
import { filterBadges, type ShelterFilter } from "@/lib/filter";

/**
 * 地図に重ねる状態の表示。**操作は置かない**（操作はパネルに集めてある）。
 *
 * 絞り込んでいるあいだは、件数ではなく**何で絞っているか**を出す。
 * 絞り込みの操作はパネルの中にしかないので、狭い画面で畳むとバーごと消え、
 * 点が減っている理由が画面のどこにも出なくなっていた（src/lib/filter.ts）。
 * 件数と入れ替えるのは、絞り込み中はその数字こそ説明を要するため。
 */
export default function MapChips({
  status,
  filter,
}: {
  status: MapStatus;
  filter: ShelterFilter;
}) {
  const badges = filterBadges(filter);

  // 広すぎるときは、隅のチップではなく地図の中央の案内で言う。
  if (status.state === "tooWide") return null;

  return (
    <>
      {badges.map((badge) => (
        <Chip key={badge.key}>
          <span className="font-medium">{badge.label}</span>
        </Chip>
      ))}
      {status.state === "loading" && <Chip>読み込み中…</Chip>}
      {status.state === "error" && <Chip>{status.message}</Chip>}
      {/*
        **「この範囲に」とは言えなくなった。** 問い合わせる矩形は格子に吸着させて
        あり、画面より少し広い（src/lib/geo.ts の snapBbox）。数えているのもその矩形の
        中なので、見えている範囲ぴったりの数ではない。数字を画面に合わせて数え直す
        手もあるが、クラスタで返ってきたときは手元に点が無いので数えられない。
        **言い方のほうを実際に合わせる。**
      */}
      {status.state === "ready" && badges.length === 0 && (
        <Chip>
          このあたりに <strong className="font-semibold">
            {status.result.total.toLocaleString("ja-JP")}
          </strong> 件
        </Chip>
      )}
      {/*
        **絞り込みで0件になったことは、言わないと分からない。** 絞り込み中は
        件数を譲っている（上）ので、残るのは「…で絞り込み中」だけになり、
        点が消えた地図を「まだ読み込んでいない」と読み分けられない。
        災害種別を複数選べるようにして**0件が普通に起きるようになった**ので
        （AND なので条件を足すほど減る）、そのときだけ言う。
      */}
      {status.state === "ready" &&
        badges.length > 0 &&
        status.result.total === 0 && <Chip>このあたりに該当なし</Chip>}
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full bg-white/95 px-3 py-1.5 text-xs text-zinc-700 shadow-sm ring-1 ring-black/10">
      {children}
    </div>
  );
}
