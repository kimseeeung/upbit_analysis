import { PgBoss } from "pg-boss";
import { getDb } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { runAllJobs } from "./run-all";

const QUEUE = "tick";
const g = globalThis as unknown as { __ptBoss?: PgBoss };

/**
 * pg-boss(PostgreSQL 기반 예약 작업) 시작. 1분마다 runAllJobs.
 * 같은 DB를 쓰는 서버가 여러 대여도 pg-boss가 한 번만 실행되게 잠근다.
 * JOBS_ENABLED=1일 때만 켠다 (테스트·빌드에서는 끔).
 */
export async function startJobs() {
  if (g.__ptBoss) return g.__ptBoss;
  const boss = new PgBoss(requireEnv("DATABASE_URL"));
  boss.on("error", (e) => console.error("[jobs] pg-boss 오류", e));
  await boss.start();
  await boss.createQueue(QUEUE);
  await boss.schedule(QUEUE, "* * * * *", null, { tz: "UTC" });
  await boss.work(QUEUE, async () => {
    const r = await runAllJobs(getDb());
    if (r.delivery.sent || r.delivery.failed)
      console.info("[jobs]", JSON.stringify(r));
  });
  g.__ptBoss = boss;
  console.info("[jobs] pg-boss 시작 (1분마다 자동 처리)");
  return boss;
}
