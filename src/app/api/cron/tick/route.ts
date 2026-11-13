import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runApprovalJobs } from "@/server/bookings/approval-service";
import { runBookingJobs } from "@/server/bookings/booking-service";

/**
 * 시간이 된 자동 처리 실행. M5에서 pg-boss 작업으로 옮기기 전까지
 * 배포 플랫폼의 주기 실행(1분마다)으로 부른다. CRON_SECRET이 없으면 닫힌다.
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
  const db = getDb();
  const bookings = await runBookingJobs(db);
  const approvals = await runApprovalJobs(db);
  return NextResponse.json({ ...bookings, ...approvals });
}
