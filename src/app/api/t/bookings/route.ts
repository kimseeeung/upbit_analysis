import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createBookingsByTrainer } from "@/server/bookings/booking-service";
import { asDate } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<Record<string, unknown>>(request);
  const rec = b.recurrence as
    { weekdays?: unknown; count?: unknown } | null | undefined;
  const r = await createBookingsByTrainer(getDb(), {
    trainerId: s.principal.userId,
    studentId: asString(b.studentId, "수강생"),
    start: asDate(b.startAt, "시작 시각"),
    durationMinutes:
      typeof b.durationMinutes === "number" ? b.durationMinutes : undefined,
    memo: typeof b.memo === "string" ? b.memo : null,
    recurrence:
      rec && Array.isArray(rec.weekdays)
        ? { weekdays: rec.weekdays.map(Number), count: Number(rec.count) || 1 }
        : null,
    acknowledgeWarnings: b.acknowledgeWarnings === true,
  });
  return NextResponse.json(r);
});
