import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";

/** 내 센터 소속 상태 (트레이너) */
export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER"]);
  const db = getDb();
  const ms = await db.centerMembership.findMany({
    where: {
      trainerId: s.principal.userId,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          address: true,
          status: true,
          dissolveAt: true,
        },
      },
    },
  });
  const admin = await db.centerAdmin.findFirst({
    where: {
      userId: s.principal.userId,
      center: { status: { not: "DISSOLVED" } },
    },
  });
  const departure = await db.trainerDeparture.findFirst({
    where: { trainerId: s.principal.userId, appliedAt: null },
  });
  return NextResponse.json({
    memberships: ms.map((m) => ({
      id: m.id,
      status: m.status,
      waitingConsent: m.status === "PENDING" && !!m.approvedAt,
      center: {
        ...m.center,
        dissolveAt: m.center.dissolveAt?.toISOString() ?? null,
      },
    })),
    isCenterAdmin: !!admin,
    departure: departure
      ? { type: departure.type, deadlineAt: departure.deadlineAt.toISOString() }
      : null,
  });
});
