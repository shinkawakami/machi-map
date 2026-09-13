import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * テストの対象は `src/lib` の純粋な関数だけ。
 *
 * **DB もブラウザも触らないものに絞る。** 準備が要らず、実行がミリ秒で終わり、
 * 壊れたときに原因が1か所に決まる。ここに集めてあるのは
 * 「壊れても画面は正常に見えるが、静かに嘘をつく」たぐいの計算なので、
 * 見て確かめる方法がいちばん効かない場所でもある。
 *
 * 画面の部品（src/features）と DB を引く関数（src/server）は対象外。
 * 前者は準備が重い割に得が少なく、後者は Postgres が要る。
 */
export default defineConfig({
  test: {
    include: ["src/lib/**/*.test.ts"],
    // 日付の表示は UTC で読む決めごとなので、実行環境の時差に左右されないよう固定する
    // （src/lib/format.ts の formatDate を参照）。
    env: { TZ: "Asia/Tokyo" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
