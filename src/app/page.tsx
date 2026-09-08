import ShelterMap from "@/components/ShelterMap";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <header className="shrink-0 border-b border-zinc-200 bg-white px-3 py-2">
        <h1 className="text-sm font-semibold text-zinc-900">
          にげどこ
          <span className="ml-2 text-xs font-normal text-zinc-500">
            全国の指定緊急避難場所・指定避難所
          </span>
        </h1>
      </header>
      <ShelterMap />
      <SiteFooter />
    </>
  );
}
