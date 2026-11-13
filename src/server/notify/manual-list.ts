import type { Db } from "@/server/db-types";
import { isPushReachable } from "./notify-service";

/**
 * 알림 못 받는 수강생 (8.4): 미가입, 알림 미허용, 발송 실패.
 * 앞으로 3일 안 수업과 응답이 필요한 항목을 카톡 공유로 보낼 수 있게 보여 준다.
 */
export async function getManualNotifyList(
  db: Db,
  trainerId: string,
  now = new Date(),
) {
  const links = await db.trainerStudentLink.findMany({
    where: { trainerId, endedAt: null, status: "ACTIVE" },
    include: { student: { select: { id: true, name: true, userId: true } } },
  });
  const out = [];
  for (const l of links) {
    const s = l.student;
    const reachable = await isPushReachable(db, s.userId);
    const recentFail = await db.notification.findFirst({
      where: {
        studentId: s.id,
        status: "FAILED",
        createdAt: { gt: new Date(now.getTime() - 3 * 86400_000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (reachable && !recentFail) continue;
    const reason = !s.userId
      ? "미가입"
      : !reachable
        ? "알림 미허용"
        : "발송 실패";
    const bookings = await db.booking.findMany({
      where: {
        studentId: s.id,
        trainerId,
        OR: [
          // 응답이 필요한 확정 요청은 날짜와 관계없이, 수업 안내는 3일 안
          { status: "PENDING_CONFIRM", startAt: { gt: now } },
          {
            status: "CONFIRMED",
            startAt: { gt: now, lte: new Date(now.getTime() + 3 * 86400_000) },
          },
          { status: "PENDING_APPROVAL", disputed: false },
        ],
      },
      orderBy: { startAt: "asc" },
    });
    const consents = await db.ruleConsent.findMany({
      where: { studentId: s.id, status: "PENDING" },
      include: { pass: { select: { name: true } } },
    });
    out.push({
      studentId: s.id,
      name: s.name,
      reason,
      items: [
        ...bookings.map((b) => ({
          kind:
            b.status === "PENDING_CONFIRM"
              ? "CONFIRM"
              : b.status === "PENDING_APPROVAL"
                ? "APPROVE"
                : "REMIND",
          refId: b.id,
          startAt: b.startAt.toISOString(),
          endAt: b.endAt.toISOString(),
        })),
        ...consents.map((c) => ({
          kind: "RULES",
          refId: c.id,
          passName: c.pass.name,
        })),
      ],
    });
  }
  return out;
}
