/**
 * 公開 API のキャッシュ指定。
 *
 * このアプリのデータは避難場所も町字も**月1回の取り込みでしか変わらない**。
 * 読み取り専用で、ログインもクッキーも無い。つまり丸ごと CDN に置ける。
 *
 * 狙いはクエリを速くすることではなく、**DB に行く回数そのものを減らす**こと。
 * 同じクエリがローカル 45〜57ms に対して本番（Vercel sin1 + Neon ap-southeast-1）で
 * 458〜668ms、Neon がスリープから復帰するときは約2.2秒かかる。差の大半は
 * クエリの重さではなく往復と復帰なので、そこを飛ばすのがいちばん効く。
 *
 * Next.js は動的なルートに既定で
 * `private, no-cache, no-store, max-age=0, must-revalidate` を付ける
 * （`docs/01-app/02-guides/cdn-caching.md`「Cache-Control headers」）。
 * 明示して上書きする。
 */

/** ブラウザ。短くする。取り込み直後の反映を、各自のブラウザに握られたくない。 */
const BROWSER_MAX_AGE = 300;

/** CDN。取り込みは月1なので1日でも実質ズレない。 */
const CDN_MAX_AGE = 86_400;

/** CDN が古い値のまま応答してよい期間。 */
const CDN_STALE = 604_800;

/**
 * ブラウザと CDN で長さを分ける。
 *
 * `CDN-Cache-Control` は CDN だけが読み、ブラウザは無視する綴り。
 * Vercel 専用の `Vercel-CDN-Cache-Control` は使わない。同じことができて、
 * こちらは載せ替えても効く。
 *
 * **効きの本体は `stale-while-revalidate`。** 期限が切れても CDN は古い値を
 * 即返して、裏で取り直す。これが無いと、キャッシュが効くほど Neon が暇になって
 * スリープし、期限切れに当たった1人だけが復帰の2.2秒を待つことになる。
 */
const HEADERS = {
  "Cache-Control": `public, max-age=${BROWSER_MAX_AGE}`,
  "CDN-Cache-Control": `public, s-maxage=${CDN_MAX_AGE}, stale-while-revalidate=${CDN_STALE}`,
} as const;

/** 取り込みの間は変わらない、公開してよいデータ。 */
export function cachedJson(data: unknown): Response {
  return Response.json(data, { headers: HEADERS });
}

/**
 * 失敗は置かない。引数の間違いを1日返し続けると、直してもしばらく直らない。
 * 「見つからない」も同じで、次の取り込みで見つかるようになりうる。
 */
export function errorJson(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
