import { startOfKstDay } from "@/lib/time";
import type { Db } from "@/server/db-types";

export interface CheckItem {
  name: string;
  ok: boolean;
  detail?: string;
}

async function step(
  name: string,
  fn: () => Promise<string | void>,
): Promise<CheckItem> {
  try {
    const detail = await fn();
    return { name, ok: true, ...(detail ? { detail } : {}) };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 롤백·재배포 뒤 주요 기능 자동 점검 (12.3-4): 서버 응답, DB, 로그인, 캘린더 조회.
 * 실제 로그인·조회 대신 같은 테이블·인덱스를 읽어 동작을 확인한다(회원 데이터는 바꾸지 않음).
 */
export async function runHealthCheck(
  db: Db,
  opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
  now = new Date(),
): Promise<CheckItem[]> {
  const baseUrl = opts.baseUrl ?? process.env.APP_BASE_URL;
  const f = opts.fetchImpl ?? fetch;
  const items: CheckItem[] = [];
  if (baseUrl) {
    items.push(
      await step("서버 응답", async () => {
        const r = await f(new URL("/api/health", baseUrl), {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }),
    );
  }
  items.push(
    await step("DB 연결", async () => {
      await db.$queryRaw`SELECT 1`;
    }),
  );
  items.push(
    await step("로그인", async () => {
      const n = await db.session.count({ where: { expiresAt: { gt: now } } });
      await db.user.findFirst({ select: { id: true } });
      return `유효 세션 ${n}개`;
    }),
  );
  items.push(
    await step("캘린더 조회", async () => {
      const from = startOfKstDay(now);
      const to = new Date(from.getTime() + 7 * 24 * 3600_000);
      const n = await db.booking.count({
        where: { startAt: { gte: from, lt: to } },
      });
      return `이번 주 예약 ${n}건`;
    }),
  );
  return items;
}
