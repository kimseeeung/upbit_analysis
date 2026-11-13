import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runAllJobs } from "@/server/jobs/run-all";

/**
 * 시간이 된 자동 처리를 지금 한 번 실행 (pg-boss를 켜지 않은 환경·점검용).
 * CRON_SECRET이 없으면 닫힌다.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(await runAllJobs(getDb()));
}
