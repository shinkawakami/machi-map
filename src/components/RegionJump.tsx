"use client";

import { useEffect, useState } from "react";

import type { AreaBounds, PrefectureArea } from "@/lib/regions";

/**
 * 都道府県 → 市区町村を選んで、その範囲へ地図を飛ばす。
 *
 * 全国から目的の街まで指で拡大していくのは手間が大きく、
 * 「場所を決める」の手前で止まる。名前から寄れる道をここで出す。
 *
 * 一覧は「地図から選ぶ」を開いたときに初めて取りに行く。
 * 1,700件ぶんの矩形を、使わない人にまで最初から配る必要はない。
 */
export default function RegionJump({
  onJump,
}: {
  onJump: (area: AreaBounds) => void;
}) {
  const [regions, setRegions] = useState<PrefectureArea[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [prefecture, setPrefecture] = useState("");
  const [municipality, setMunicipality] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/regions", { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setRegions(await res.json());
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
      }
    })();

    return () => controller.abort();
  }, []);

  const selected = regions?.find((r) => r.name === prefecture);

  // 一覧が来なくても、地図を動かして決めるほうは使える。黙って消す。
  if (failed) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Select
        label="都道府県"
        value={prefecture}
        disabled={!regions}
        placeholder={regions ? "都道府県" : "読み込み中…"}
        options={(regions ?? []).map((r) => ({ value: r.name, label: r.name }))}
        // 県を選んでも地図は動かさない。市区町村の一覧を絞るだけ。
        onChange={(value) => {
          setPrefecture(value);
          setMunicipality("");
        }}
      />
      <Select
        label="市区町村"
        value={municipality}
        disabled={!selected}
        placeholder="市区町村"
        options={(selected?.municipalities ?? []).map((m) => ({
          value: m.code,
          label: m.name,
        }))}
        onChange={(value) => {
          setMunicipality(value);
          const next = selected?.municipalities.find((m) => m.code === value);
          if (next) onJump(next);
        }}
      />
    </div>
  );
}

function Select({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 disabled:text-zinc-400"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
