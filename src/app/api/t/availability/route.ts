import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getAvailability,
  saveAvailability,
  type AvailabilityInput,
} from "@/server/bookings/availability-settings";
import { readJson, requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER"]);
  return NextResponse.json(await getAvailability(getDb(), s.principal.userId));
});

export const PUT = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<AvailabilityInput>(request);
  await saveAvailability(getDb(), s.principal.userId, {
    rules: Array.isArray(b.rules) ? b.rules : [],
    exceptions: Array.isArray(b.exceptions) ? b.exceptions : [],
  });
  return NextResponse.json({ ok: true });
});
