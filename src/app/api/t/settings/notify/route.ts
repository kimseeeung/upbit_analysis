import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isValidDayBeforeTime } from "@/lib/notify/night";
import { AppError } from "@/server/errors";
import { readJson, requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER"]);
  const p = await getDb().trainerProfile.findUnique({
    where: { userId: s.principal.userId },
  });
  return NextResponse.json({
    dayBeforeNotifyTime: p?.dayBeforeNotifyTime ?? "20:00",
  });
});

/** 전일 알림 시각 (08:00~20:30) */
export const PATCH = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ dayBeforeNotifyTime?: unknown }>(request);
  const t = String(b.dayBeforeNotifyTime ?? "");
  if (!isValidDayBeforeTime(t))
    throw new AppError(
      "INVALID",
      "전일 알림 시각은 08:00~20:30 사이에서 골라 주세요",
    );
  await getDb().trainerProfile.update({
    where: { userId: s.principal.userId },
    data: { dayBeforeNotifyTime: t },
  });
  return NextResponse.json({ ok: true });
});
