import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestBookingByStudent } from "@/server/bookings/booking-service";
import { asDate } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

/** 수강생 예약 신청 */
export const POST = route(async (request) => {
  const s = await requireApiSession(["STUDENT"]);
  const b = await readJson<{ startAt?: unknown }>(request);
  const r = await requestBookingByStudent(getDb(), {
    userId: s.principal.userId,
    start: asDate(b.startAt),
  });
  return NextResponse.json({ bookingId: r.id });
});
