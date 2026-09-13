import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 は Rust のクエリエンジンを使わず、ドライバアダプタ経由で接続する。
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// dev では HMR のたびに新しいクライアントが作られて接続を食い潰すので、
// グローバルに1つだけ持つ。
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
