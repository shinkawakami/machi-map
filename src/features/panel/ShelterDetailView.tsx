"use client";

import type { ShelterKind } from "@/generated/prisma/enums";
import { type DisasterKey, DISASTER_TYPES } from "@/lib/disasters";
import { kindOf, KINDS } from "@/lib/kinds";
import type { PlaceDetail, ShelterDetail } from "@/lib/shelter";

/**
 * 1つの場所の中身。
 *
 * **同じ施設に複数の指定があるときは、まとめて出す。**
 * 地図と一覧では1施設1つに寄せて見せているので、押した先で1つしか出ないと、
 * ほかの指定にしか無い項目（受入対象者・その他市町村長が必要と認める事項）が消える。
 *
 * ただし**指定の数だけブロックを積むと、同じ見出しが並ぶ**。実データでは、
 * 名前も住所も中身も同じ指定避難所が2つある施設が 388 あり、
 * 受入対象者の有無だけが違うもの（通常の指定避難所と指定福祉避難所）が 1,096 ある。
 * 前者は読む人にとってただの重複で、後者も見出しと説明は同じものが2回出る。
 *
 * そこで**「種別 × 災害種別」でまとめて1ブロックにし、項目は寄せて出す**。
 * 災害種別まで条件に入れるのは、同じ施設で緊急の指定が2つあり、
 * **対応する災害が食い違う**ものが 23 施設あるため。ここを束ねて和を取ると
 * 「この災害でも使える」と嘘をつくので、食い違うものは別のブロックに分ける。
 *
 * **その場所だけの情報を持たないブロックは、1行に畳む。** 実データでは、指定避難所の
 * 87.5%（72,879 件）が受入対象者・その他・備考のどれも持たない。畳まないと、
 * それらの場所では「見出し＋役割の説明＋災害種別の指定がありません」という
 * **どこを開いても一字一句同じ4行**が、8種の表の下に必ず付く。
 * 役割の説明そのものは畳んでも消さない（「逃げ込む場所」と「生活する施設」の対比は
 * 主張2そのもので、曖昧にするとこのアプリの存在理由が消える）。
 * 指定緊急避難場所は固有情報が無くても**8種の ○/×** が場所ごとに違うので、畳まない。
 *
 * 災害種別は**8種すべて**を出し、対応していないものにも×を付ける。
 * 対応するものだけ並べると「書いていない災害はどうなのか」が読み取れず、
 * このアプリが伝えたい「洪水では使えない避難場所がある」が消える。
 */
export default function ShelterDetailView({
  detail,
}: {
  detail: PlaceDetail;
}) {
  const blocks = toBlocks([detail, ...detail.others]);
  const full = blocks.filter((block) => !isCompact(block, blocks.length));
  // バッジは「どの種別があるか」。ブロックは災害種別が食い違うと分かれるので、
  // そのまま並べると同じ種別のバッジが2つ出る。
  const kinds = [...new Set(blocks.map((b) => b.kind))];
  const otherKind = KINDS.find((k) => k.key !== detail.kind)!;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <span className="flex flex-wrap items-center gap-1">
          {kinds.map((kind) => (
            <span
              key={kind}
              className="inline-block rounded-full px-2 py-0.5 text-xs text-white"
              style={{ backgroundColor: kindOf(kind).color }}
            >
              {kindOf(kind).label}
            </span>
          ))}
        </span>
        <h2 className="mt-1 text-base leading-snug font-semibold text-zinc-900">
          {detail.name}
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">{detail.address}</p>
        {/*
          **調べた先と、実際に行くことのあいだを埋める。**
          このアプリが出せるのは直線距離までで、川や崖を挟んでいても短く出る。
          そこから先（どの道を通るか）は地図アプリの仕事なので、渡してしまう。

          外部の地図サービスへ**座標を渡して開くだけ**のリンクで、API も鍵も使わない
          （住所検索で外部 API を避けたのは規約の判断が戻ってくるためで、
          この種のリンクはその話とは別）。徒歩を指定するのは、緊急避難場所へ
          向かう手段が原則として徒歩だから。
        */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${detail.lat},${detail.lng}&travelmode=walking`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-10 items-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          徒歩の経路を見る（Google マップ）↗
        </a>
        {/* 畳んだ1行が自分で名乗るので、そのときはこの断りは要らない。 */}
        {full.length > 1 && (
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            この場所には
            <strong className="font-semibold text-zinc-900">
              複数の指定
            </strong>
            があります。役割が違うので、それぞれ下に出します。
          </p>
        )}
      </div>

      {blocks.map((block) => {
        const key = `${block.kind}/${block.disasters?.join("+") ?? ""}`;
        return isCompact(block, blocks.length) ? (
          <CompactDesignation key={key} block={block} />
        ) : (
          <Designation key={key} block={block} labelled={blocks.length > 1} />
        );
      })}

      {/*
        名前まで一致する指定は上で中身ごと出しているので、そのときは言わない。
        ここで残るのは「住所は同じだが名前が違う」もので、同じ施設とは限らない。
      */}
      {detail.others.length === 0 && detail.sameAddressAsOther && (
        <p className="rounded bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600">
          同じ住所に{otherKind.label}
          の指定もあります（国土地理院のデータ上の住所が一致するという意味で、
          同じ施設とは限りません）。
        </p>
      )}

      <p className="border-t border-zinc-100 pt-2 text-xs leading-relaxed text-zinc-500">
        最新かつ詳細な情報は、必ず市町村にご確認ください。
      </p>
    </div>
  );
}

/** 画面に出す1ブロック。同じ種別・同じ災害種別の指定を束ねたもの。 */
type Block = {
  kind: ShelterKind;
  disasters: DisasterKey[] | null;
  /** 束ねた指定が持っていた値。重複は落とす */
  targetPersons: string[];
  otherMatters: string[];
  note: string[];
};

function toBlocks(designations: ShelterDetail[]): Block[] {
  const blocks = new Map<string, Block>();

  for (const d of designations) {
    const key = `${d.kind}/${d.disasters?.join("+") ?? ""}`;
    const block = blocks.get(key) ?? {
      kind: d.kind,
      disasters: d.disasters,
      targetPersons: [],
      otherMatters: [],
      note: [],
    };

    push(block.targetPersons, d.targetPersons);
    push(block.otherMatters, d.otherMatters);
    push(block.note, d.note);
    blocks.set(key, block);
  }

  // 指定緊急避難場所を先に置く。先に向かう場所で、災害種別を持つのもこちら。
  return [...blocks.values()].sort(
    (a, b) =>
      (a.kind === "EMERGENCY" ? 0 : 1) - (b.kind === "EMERGENCY" ? 0 : 1),
  );
}

function push(values: string[], value: string | null): void {
  if (value && !values.includes(value)) values.push(value);
}

/**
 * 1行に畳めるか。
 *
 * 畳むのは**ほかに出すブロックがあり、かつ場所ごとの中身を1つも持たない**とき。
 * 単独で開かれたとき（青い点を押した、など）は畳まない。
 * 「でもあります」が嘘になるし、災害種別が無い理由の説明も要る。
 * 災害種別を持つ側（指定緊急避難場所）は、○/× が場所ごとの中身なので畳まない。
 */
function isCompact(block: Block, blockCount: number): boolean {
  return (
    blockCount > 1 &&
    block.disasters === null &&
    block.targetPersons.length === 0 &&
    block.otherMatters.length === 0 &&
    block.note.length === 0
  );
}

/** 場所ごとの中身が無いブロック。名乗りと役割だけを1行で置く。 */
function CompactDesignation({ block }: { block: Block }) {
  const kind = kindOf(block.kind);

  return (
    <div className="flex items-start gap-1.5 border-t border-zinc-100 pt-2.5">
      <span
        className="mt-1 size-2 shrink-0 rounded-full"
        style={{ backgroundColor: kind.color }}
      />
      <p className="text-sm leading-relaxed text-zinc-600">
        <strong className="font-semibold text-zinc-900">
          {kind.label}でもあります。
        </strong>
        {kind.description}。災害種別の指定はありません。
      </p>
    </div>
  );
}

/** 1ブロックぶん。複数あるときだけ、どれの話なのかを見出しで断る。 */
function Designation({
  block,
  labelled,
}: {
  block: Block;
  /** 同じ場所に複数のブロックがあるか。1つだけなら見出しは要らない */
  labelled: boolean;
}) {
  const kind = kindOf(block.kind);

  return (
    <div className={labelled ? "border-t border-zinc-100 pt-2.5" : ""}>
      {labelled && (
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: kind.color }}
          />
          {kind.label}
        </h3>
      )}
      <p className={`text-sm text-zinc-600 ${labelled ? "mt-0.5" : ""}`}>
        {kind.description}
      </p>

      <section className="mt-2">
        <h4 className="text-xs font-semibold text-zinc-500">対応する災害</h4>
        {block.disasters === null ? (
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            指定避難所には災害種別の指定がありません。
            災害の種類ごとに使える・使えないが分かれるのは指定緊急避難場所のほうです。
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {DISASTER_TYPES.map((disaster) => {
              const on = block.disasters!.includes(disaster.key);
              return (
                <li
                  key={disaster.key}
                  title={disaster.sourceLabel}
                  className={`rounded border px-2 py-1 text-xs ${
                    on
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-500"
                  }`}
                >
                  {on ? "○" : "×"} {disaster.label}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Field label="受入対象者" values={block.targetPersons} />
      <Field
        label="その他市町村長が必要と認める事項"
        values={block.otherMatters}
      />
      <Field label="備考" values={block.note} />
    </div>
  );
}

function Field({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <section className="mt-2">
      <h4 className="text-xs font-semibold text-zinc-500">{label}</h4>
      {values.map((value) => (
        <p
          key={value}
          className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-zinc-700"
        >
          {value}
        </p>
      ))}
    </section>
  );
}
