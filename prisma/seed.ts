/**
 * 기본 데이터: 약관 초안 (src/server/terms-defaults.ts). 서버가 뜰 때도 같은 내용을 넣는다.
 * 비밀값(운영 관리자 계정 등)은 여기에 쓰지 않는다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  TERMS_VERSION,
  ensureDefaultTerms,
} from "../src/server/terms-defaults";

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const n = await ensureDefaultTerms(db);
  console.info(`약관 ${n}종 준비 완료 (${TERMS_VERSION})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
