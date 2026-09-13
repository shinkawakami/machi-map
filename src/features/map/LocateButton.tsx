"use client";

import { MY_LOCATION_COLOR } from "@/features/map/map-style";

/**
 * 現在地はいつでも押せるようにする。パネルの状態に左右されない場所として、
 * ズーム（MapLibre の NavigationControl・右上）の真下に置き、
 * 地図の操作系としてまとめる。下に置くと、スマホでは下のシートに隠れる。
 *
 * **記号だけにしない。** 照準の記号は地図アプリの慣習どおりだが、
 * タッチ端末では title が出ないので、記号を知らない人には手がかりが無くなる。
 * 文字を添えて、高さも 29px（ズームと同じ）から 40px に上げ、指で押せる大きさにする。
 */
export default function LocateButton({
  onClick,
  locating,
}: {
  onClick: () => void;
  locating: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locating}
      aria-label="現在地から探す"
      className="absolute top-[76px] right-2.5 z-10 flex h-10 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-xs font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-60"
    >
      <LocateIcon active={locating} />
      {locating ? "取得中…" : "現在地"}
    </button>
  );
}

/** 現在地のアイコン。照準（十字＋中心の点）は地図アプリで共通の見た目。 */
function LocateIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#a1a1aa" : MY_LOCATION_COLOR}
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.6" fill={MY_LOCATION_COLOR} stroke="none" />
      <line x1="12" y1="1.5" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22.5" y2="12" />
    </svg>
  );
}
