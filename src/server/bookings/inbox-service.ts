import type { Db } from "@/server/db-types";

const iso = (d: Date) => d.toISOString();
const slots = (j: unknown) => (j as { startAt: string; endAt: string }[]) ?? [];

/** 요청함의 예약 항목 */
export async function getBookingInbox(
  db: Db,
  userId: string,
  role: "TRAINER" | "STUDENT",
) {
  if (role === "TRAINER") {
    const [requests, cancels, changes] = await Promise.all([
      db.booking.findMany({
        where: { trainerId: userId, status: "REQUESTED" },
        include: { student: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      }),
      db.booking.findMany({
        where: {
          trainerId: userId,
          status: "CONFIRMED",
          cancelRequestedAt: { not: null },
        },
        include: { student: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      }),
      db.bookingChangeRequest.findMany({
        where: {
          status: "PENDING",
          requestedBy: { not: userId },
          booking: { trainerId: userId },
        },
        include: {
          booking: { include: { student: { select: { name: true } } } },
        },
        orderBy: { expiresAt: "asc" },
      }),
    ]);
    return {
      bookingRequests: requests.map((b) => ({
        bookingId: b.id,
        name: b.student.name,
        startAt: iso(b.startAt),
        endAt: iso(b.endAt),
      })),
      cancelRequests: cancels.map((b) => ({
        bookingId: b.id,
        name: b.student.name,
        startAt: iso(b.startAt),
        requestedAt: iso(b.cancelRequestedAt!),
        reason: b.cancelRequestReason,
      })),
      changeRequests: changes.map((c) => ({
        requestId: c.id,
        kind: c.kind,
        bookingId: c.bookingId,
        name: c.booking.student.name,
        startAt: iso(c.booking.startAt),
        endAt: iso(c.booking.endAt),
        slots: slots(c.proposedSlots),
        expiresAt: iso(c.expiresAt),
      })),
      confirmRequests: [],
    };
  }

  const student = await db.student.findUnique({ where: { userId } });
  if (!student)
    return {
      bookingRequests: [],
      cancelRequests: [],
      changeRequests: [],
      confirmRequests: [],
    };
  const [pending, changes] = await Promise.all([
    db.booking.findMany({
      where: { studentId: student.id, status: "PENDING_CONFIRM" },
      include: { trainer: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
    db.bookingChangeRequest.findMany({
      where: {
        status: "PENDING",
        kind: "CHANGE",
        requestedBy: { not: userId },
        booking: { studentId: student.id },
      },
      include: {
        booking: { include: { trainer: { select: { name: true } } } },
      },
      orderBy: { expiresAt: "asc" },
    }),
  ]);
  // 반복 예약은 묶어서 하나로 보여 주고 한 번에 수락·거절
  const groups = new Map<string, typeof pending>();
  for (const b of pending) {
    const key = b.recurringGroupId ?? b.id;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return {
    bookingRequests: [],
    cancelRequests: [],
    confirmRequests: [...groups.values()].map((list) => ({
      bookingId: list[0].id,
      trainerName: list[0].trainer.name,
      grouped: list.length > 1,
      times: list.map((b) => ({
        startAt: iso(b.startAt),
        endAt: iso(b.endAt),
      })),
    })),
    changeRequests: changes.map((c) => ({
      requestId: c.id,
      kind: c.kind,
      bookingId: c.bookingId,
      name: c.booking.trainer.name,
      startAt: iso(c.booking.startAt),
      endAt: iso(c.booking.endAt),
      slots: slots(c.proposedSlots),
      expiresAt: iso(c.expiresAt),
    })),
  };
}
