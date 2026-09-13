import IntroCard from "@/components/IntroCard";
import ShelterMap from "@/components/ShelterMap";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <h1 className="min-w-0 truncate text-sm font-semibold text-zinc-900">
          わが家の逃げ先
          {/*
            5秒で伝える1行。**説明ではなく、やってほしいことと見返りを書く。**
            「避難場所の地図」だけでは既存の防災マップと区別がつかないし、
            開いた人は何をすればいいのか分からないまま地図を眺めることになる。
            狭い画面では前半（やること）だけを残す。
          */}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            自宅や職場を登録
            <span className="hidden sm:inline">
              すると、8種類の災害それぞれの逃げ先が1枚の表になります
            </span>
            <span className="sm:hidden">→ 災害ごとの逃げ先が1枚に</span>
          </span>
        </h1>
        <IntroCard />
      </header>
      <ShelterMap />
      <SiteFooter />
    </>
  );
}
