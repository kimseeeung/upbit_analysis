/** 모든 잠금 풀기 (npm run accounts:unlock): 운영 관리자·회원 로그인 잠금, 운영 관리자 롤백 PIN 잠금 */
import "dotenv/config";
import { getDb } from "@/lib/db";

async function main() {
  const db = getDb();
  const ops = await db.operatorAccount.updateMany({
    data: {
      failCount: 0,
      lockedUntil: null,
      rollbackPinFailCount: 0,
      rollbackLockedUntil: null,
    },
  });
  const users = await db.user.updateMany({
    data: { loginFailCount: 0, lockedUntil: null },
  });
  console.log(
    `✅ 잠금 해제: 운영 관리자 ${ops.count}명, 회원 ${users.count}명`,
  );
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
