"use client";

import type { ShelterKind } from "@/generated/prisma/enums";
import { type DisasterKey, DISASTER_TYPES } from "@/lib/disasters";
import { kindOf, KINDS } from "@/lib/kinds";
import {
  type PlaceDetail,
  SAME_ADDRESS_LIMIT,
  type SameAddressPlace,
  type ShelterDetail,
} from "@/lib/shelter";

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
 * 指定緊急避難場所は固有情報が無くても**8種の ○/× が場所ごとに違う**ので、畳まない
 * （組み合わせは実測で 235 通り、最多のパターンでも 7.4% しかない）。
 *
 * **定型文は、一覧・表の中で開いたときには出さない（inline）。**
 * 役割の説明も「災害種別の指定がありません」も、種別が同じなら全件で同じ文章。
 * 87.5% の指定避難所では、**開いて増える場所固有の事実は住所と経路リンクの2つだけ**で、
 * 残りは定型文だった（災害別の表から開いた場合は、住所も行に出ているので経路リンクだけ）。
 * 定型文4行の下にそれを置く形になっていて、開く値打ちを自分で消していた。
 *
 * **消したのではなく、文脈が無いところに寄せた。** 主張2（緊急避難場所と避難所は別物）は
 * 初回カード（IntroCard。ヘッダの「？」でいつでも戻せる）と、災害別の表の
 * 「災害がおさまったあと、生活する場所（指定避難所）」の見出しが担う。
 * **地図の点から直接開いたときだけは残す**（そこには周りの文脈が何も無いので、
 * 種別の名前だけ出しても「別物」が伝わらない）。
 *
 * 災害種別は**8種すべて**を出し、対応していないものにも×を付ける。
 * 対応するものだけ並べると「書いていない災害はどうなのか」が読み取れず、
 * このアプリが伝えたい「洪水では使えない避難場所がある」が消える。
 */
export default function ShelterDetailView({
  detail,
  inline = false,
  omitName = false,
  omitAddress = false,
  onOpenSameAddress,
}: {
  detail: PlaceDetail;
  /** 同じ住所にある別の指定を押したとき。その施設の詳細へ移る */
  onOpenSameAddress: (place: SameAddressPlace) => void;
  /**
   * 一覧・表の行の中に出しているか。周りに文脈があるので、全件で同じ文章
   * （役割の説明・災害種別の指定がありません）は出さない。
   */
  inline?: boolean;
  /** 上の行がすでに施設名を見出しに出しているとき（DetailPane の InlineDetail） */
  omitName?: boolean;
  /** 上の行がすでに住所を出しているとき */
  omitAddress?: boolean;
}) {
  const blocks = toBlocks([detail, ...detail.others]);
  const full = blocks.filter((block) => !isCompact(block, blocks.length));
  const otherKind = KINDS.find((k) => k.key !== detail.kind)!;
  /*
    **古い JSON が返ってくる前提で読む。** 詳細は CDN で1日（stale 7日）、
    ブラウザでも5分キャッシュされる（src/server/http-cache.ts）。sameAddress は
    あとから足した項目なので、**新しい画面に古い応答が返る窓がある**。
    素直に .length を読むと、そこで詳細の描画ごと落ちる。
    無ければ空として扱えば、名前が出ないだけで下の従来の言い方に落ちる。
  */
  const sameAddress = detail.sameAddress ?? [];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        {/*
          **種別の名乗りは1回にする。** 指定が複数あるときは下のブロックが
          それぞれ見出しで名乗るので（Designation の labelled と、
          CompactDesignation の「〇〇でもあります。」）、ここにも出すと
          同じ語が2回ずつ並ぶ。あいだに「複数の指定があります」の1文も挟まるので、
          **同じ事実が3通りの言い方で出ていた。**

          指定が1つのときは下に見出しが出ない（labelled が false）ので、
          **ここが唯一の名乗り**になる。出す条件をそれと同じにする。
        */}
        {blocks.length === 1 && (
          <span
            className="inline-block rounded-full px-2 py-0.5 text-xs text-white"
            style={{ backgroundColor: kindOf(blocks[0].kind).color }}
          >
            {kindOf(blocks[0].kind).label}
          </span>
        )}
        {!omitName && (
          <h2 className="mt-1 text-base leading-snug font-semibold text-zinc-900">
            {detail.name}
          </h2>
        )}
        {!omitAddress && (
          <p
            className={`text-[13px] text-zinc-500 ${omitName ? "mt-1" : "mt-0.5"}`}
          >
            {detail.address}
          </p>
        )}
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
          <CompactDesignation key={key} block={block} inline={inline} />
        ) : (
          <Designation
            key={key}
            block={block}
            labelled={blocks.length > 1}
            inline={inline}
          />
        );
      })}

      {/*
        **調べた先と、実際に行くことのあいだを埋める。**
        このアプリが出せるのは直線距離までで、川や崖を挟んでいても短く出る。
        そこから先（どの道を通るか）は地図アプリの仕事なので、渡してしまう。

        外部の地図サービスへ**座標を渡して開くだけ**のリンクで、API も鍵も使わない
        （住所検索で外部 API を避けたのは規約の判断が戻ってくるためで、
        この種のリンクはその話とは別）。**徒歩を指定するのは、緊急避難場所へ
        向かう手段が原則として徒歩だから**。文言から落とせないのはここと
        「（Google マップ）」で、アプリの外へ出る先は名乗ってから飛ばす。
        削れたのは「を見る」だけ（リンクなら自明）。それで 286px → 244px。

        **置き場所は指定のブロックより下。** 以前は名前と住所のすぐ下にあり、
        「どうやって行くか」が「この災害で使えるか」（○/×）より上に来ていた。
        地図アプリの施設カードは経路ボタンが上にあるが、**あちらは行き先が
        もう決まっている前提**で、こちらは行き先を決めるための画面なので順序が違う。
        指定避難所のように ○/× を持たないものでは、結果的に同じ位置に来る。

        flex の子なので display は block 化される。self-start を付けないと
        柱の幅いっぱいに伸びる。
      */}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${detail.lat},${detail.lng}&travelmode=walking`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-10 items-center self-start rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
      >
        徒歩の経路（Google マップ）↗
      </a>

      {/*
        名前まで一致する指定は上で中身ごと出しているので、そのときは言わない。
        ここで残るのは「住所は同じだが名前が違う」もの。開いた施設の 13.5% で出る。

        **相手の名前を出す。** 以前は「同じ住所にもう一方の指定もあります
        （…同じ施設とは限りません）」とだけ書いていて、**括弧の打ち消しが本文より
        長く、読み終えても何も決められなかった**。実データでは「〇〇小学校」と
        「〇〇小学校 グラウンド」のように建物のどこが指定されているかが違うだけの
        ものが大半で、**名前さえ出れば同じ施設かどうかは人が一目で決められる**。
        断りは残すが、判断の材料を先に置いて、打ち消しは添え物に降ろす。
      */}
      {detail.others.length === 0 && detail.sameAddressAsOther && (
        <p className="rounded bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600">
          {sameAddress.length > 0 ? (
            <>
              同じ住所に
              {/*
                **名前は押せる。** 校舎とグラウンドのように同じ施設の別の場所で
                あることが多く、そのときは相手の ○/× こそ知りたいものになる。
                座標も持っているので、移った先では地図の選択の輪もそちらに動く。
                打ち切った「ほか」は手元に行がないので、押せる形にはしない。
              */}
              {sameAddress
                .slice(0, SAME_ADDRESS_LIMIT)
                .map((place, index) => (
                  <span key={place.id}>
                    {index > 0 && "・"}
                    <button
                      type="button"
                      onClick={() => onOpenSameAddress(place)}
                      className="font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                    >
                      {place.name}
                    </button>
                  </span>
                ))}
              {sameAddress.length > SAME_ADDRESS_LIMIT && (
                <span className="font-semibold text-zinc-900"> ほか</span>
              )}
              （{otherKind.label}）があります。
              名前が違うので、同じ建物の別の場所のことも、別の施設のこともあります。
            </>
          ) : (
            /*
              旗は立っているのに相手を引けなかったとき（住所の表記ゆれ。
              実測で 26,890 件中 239 件）。名前が無いので、従来どおりの言い方に落とす。
            */
            <>
              同じ住所に{otherKind.label}の指定もあります
              （国土地理院のデータ上、住所が一致するという意味です）。
            </>
          )}
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
function CompactDesignation({
  block,
  inline,
}: {
  block: Block;
  inline: boolean;
}) {
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
        {/* 後半は種別が同じなら全件で同じ文章。文脈がある場所では出さない。 */}
        {!inline && `${kind.description}。災害種別の指定はありません。`}
      </p>
    </div>
  );
}

/** 1ブロックぶん。複数あるときだけ、どれの話なのかを見出しで断る。 */
function Designation({
  block,
  labelled,
  inline,
}: {
  block: Block;
  /** 同じ場所に複数のブロックがあるか。1つだけなら見出しは要らない */
  labelled: boolean;
  inline: boolean;
}) {
  const kind = kindOf(block.kind);
  const hasFields =
    block.targetPersons.length > 0 ||
    block.otherMatters.length > 0 ||
    block.note.length > 0;
  /*
    ○/× は場所ごとに違う（235 通り）ので常に出す。指定避難所の「指定がありません」は
    全件で同じ文章なので、周りに文脈がある一覧・表の中では出さない。
  */
  const showDisasters = block.disasters !== null || !inline;

  // 定型文を落とした結果、出すものが何も残らないことがある。空の枠は置かない。
  if (!labelled && inline && !showDisasters && !hasFields) return null;

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
      {!inline && (
        <p className={`text-sm text-zinc-600 ${labelled ? "mt-0.5" : ""}`}>
          {kind.description}
        </p>
      )}

      {showDisasters && (
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
      )}

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
