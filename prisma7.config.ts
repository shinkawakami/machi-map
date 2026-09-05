import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // マイグレーションは接続プーラー（Neon の -pooler ホスト）を経由すると
    // アドバイザリロックが効かず不安定になるので、直結の DIRECT_URL を優先する。
    // ローカルの Docker はプーラーが無いので DIRECT_URL は未設定でよい。
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
