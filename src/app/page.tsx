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
            5秒で伝える1行。「避難場所の地図」だけでは既存の防災マップと区別がつかないので、
            拠点ごとに出すことと、災害の種類で変わることを名前のすぐ横に置く。
          */}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            自宅や職場から、災害の種類ごとの避難場所
          </span>
        </h1>
        <IntroCard />
      </header>
      <ShelterMap />
      <SiteFooter />
    </>
  );
}
