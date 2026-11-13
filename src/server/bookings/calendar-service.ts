import { openSlots, workingRangesOn } from "@/lib/booking/schedule";
import { OCCUPYING } from "@/lib/booking/state-machine";
import { addKstDays, parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { getPassSummaries } from "@/server/passes/availability-service";
import { getStudentOfUser } from "@/server/students/access";
import { getAvailability } from "./availability-settings";
import { describeRules } from "@/lib/rules/rule-set";
import { bookingPassContext, sessionMinutesFor } from "./core";

function range(from: string, to: string) {
  let start: Date;
  let end: Date;
  try {
    start = parseKstDateKey(from);
    end = addKstDays(parseKstDateKey(to), 1);
  } catch {
    throw new AppError("INVALID", "기간을 확인해 주세요");
  }
  if (end <= start || end.getTime() - start.getTime() > 62 * 24 * 3600_000) {
    throw new AppError("INVALID", "한 번에 62일까지 볼 수 있습니다");
  }
  return { start, end };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function slotsOf(json: unknown) {
  return (json as { startAt: string; endAt: string }[]) ?? [];
}

/** 트레이너 캘린더 (4.2): 예약, 근무 시간, 대기 중인 변경 요청 */
export async function getTrainerCalendar(
  db: Db,
  trainerId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const r = range(from, to);
  const bookings = await db.booking.findMany({
    where: { trainerId, startAt: { lt: r.end }, endAt: { gt: r.start } },
    include: {
      student: {
        select: {
          name: true,
          userId: true,
          passes: {
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            select: { agreedRuleSetId: true },
          },
        },
      },
      changeRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { startAt: "asc" },
  });
  const av = await getAvailability(db, trainerId);
  const working: { start: string; end: string }[] = [];
  for (let d = r.start; d < r.end; d = addKstDays(d, 1)) {
    for (const w of workingRangesOn(toKstDateKey(d), av.rules, av.exceptions)) {
      working.push({ start: w.start.toISOString(), end: w.end.toISOString() });
    }
  }
  const pendingRequests = await db.booking.count({
    where: {
      trainerId,
      OR: [
        { status: "REQUESTED" },
        { status: "CONFIRMED", cancelRequestedAt: { not: null } },
      ],
    },
  });
  return {
    now: now.toISOString(),
    hasAvailability: av.rules.length > 0,
    working,
    pendingRequests,
    bookings: bookings.map((b) => {
      const cr = b.changeRequests[0];
      return {
        id: b.id,
        studentId: b.studentId,
        studentName: b.student.name,
        studentRegistered: !!b.student.userId,
        ruleUnagreed: b.student.passes.some((p) => !p.agreedRuleSetId),
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        status: b.status,
        source: b.source,
        autoConfirmed: b.autoConfirmed,
        recurringGroupId: b.recurringGroupId,
        memo: b.memo,
        cancelRequestedAt: iso(b.cancelRequestedAt),
        cancelRequestReason: b.cancelRequestReason,
        deducted: b.deducted,
        deductReason: b.deductReason,
        deductSkippedReason: b.deductSkippedReason,
        rejectReason: b.rejectReason,
        approvalRequestedAt: iso(b.approvalRequestedAt),
        approvedAt: iso(b.approvedAt),
        approvalMethod: b.approvalMethod,
        trainerConfirmNeeded: b.trainerConfirmNeeded,
        disputed: b.disputed,
        disputeKind: b.disputeKind,
        disputeStudentReason: b.disputeStudentReason,
        disputeTrainerDecision: b.disputeTrainerDecision,
        disputeTrainerReason: b.disputeTrainerReason,
        disputeResolvedAt: iso(b.disputeResolvedAt),
        changeRequest: cr
          ? {
              id: cr.id,
              kind: cr.kind,
              mine: cr.requestedBy === trainerId,
              slots: slotsOf(cr.proposedSlots),
              expiresAt: cr.expiresAt.toISOString(),
            }
          : null,
      };
    }),
  };
}

/** 수강생 홈 캘린더 (10장): 내 수업, 요약, 트레이너의 예약 가능 시간 */
export async function getStudentCalendar(
  db: Db,
  userId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const r = range(from, to);
  const student = await getStudentOfUser(db, userId);
  const bookings = await db.booking.findMany({
    where: {
      studentId: student.id,
      startAt: { lt: r.end },
      endAt: { gt: r.start },
    },
    include: {
      trainer: { select: { name: true } },
      changeRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { startAt: "asc" },
  });

  let slots: { start: string; end: string }[] = [];
  let hasAvailability = false;
  if (student.currentTrainerId) {
    const av = await getAvailability(db, student.currentTrainerId);
    hasAvailability = av.rules.length > 0;
    if (hasAvailability) {
      // 다른 수강생 정보는 보내지 않고, 바쁜 시간만 빼서 빈 시간으로 만든다
      const busy = await db.booking.findMany({
        where: {
          OR: [
            { trainerId: student.currentTrainerId },
            { studentId: student.id },
          ],
          status: { in: [...OCCUPYING] },
          startAt: { lt: r.end },
          endAt: { gt: r.start },
        },
        select: { startAt: true, endAt: true },
      });
      const minutes = await sessionMinutesFor(db, student.id, from);
      slots = openSlots({
        from,
        to,
        sessionMinutes: minutes,
        rules: av.rules,
        exceptions: av.exceptions,
        busy: busy.map((b) => ({ start: b.startAt, end: b.endAt })),
        now,
      }).map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      }));
    }
  }

  const summary = await getPassSummaries(db, student.id, toKstDateKey(now));
  const passes = await db.pass.findMany({
    where: { studentId: student.id, status: { in: ["ACTIVE", "PAUSED"] } },
    orderBy: { endDate: "asc" },
  });
  const usable = passes.filter(
    (p) => toKstDateKey(p.endDate) >= toKstDateKey(now),
  );
  // 노쇼·당일 취소에는 적용한 규칙을 함께 보여 준다 (3.5, 10장)
  const ruleText = new Map<string, string>();
  for (const b of bookings) {
    if (
      b.status !== "NO_SHOW" &&
      !(b.status === "CANCELED" && (b.deducted || b.deductSkippedReason))
    )
      continue;
    const ctx = await bookingPassContext(db, b);
    const line = describeRules(ctx.rules).find(
      (l) => l.title === (b.status === "NO_SHOW" ? "노쇼" : "당일 취소"),
    );
    if (line) ruleText.set(b.id, line.text);
  }
  const next = await db.booking.findFirst({
    where: {
      studentId: student.id,
      status: { in: ["CONFIRMED", "PENDING_CONFIRM"] },
      startAt: { gt: now },
    },
    orderBy: { startAt: "asc" },
  });

  return {
    now: now.toISOString(),
    hasTrainer: !!student.currentTrainerId,
    hasAvailability,
    summary: {
      nextBooking: next
        ? { startAt: next.startAt.toISOString(), status: next.status }
        : null,
      remaining: usable.reduce(
        (n, p) => n + (summary.byPass[p.id]?.remaining ?? 0),
        0,
      ),
      total: usable.reduce((n, p) => n + (summary.byPass[p.id]?.total ?? 0), 0),
      expiry: usable[0] ? toKstDateKey(usable[0].endDate) : null,
      availableToday: summary.availableToday,
    },
    slots,
    bookings: bookings.map((b) => {
      const cr = b.changeRequests[0];
      return {
        id: b.id,
        trainerName: b.trainer.name,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        status: b.status,
        autoConfirmed: b.autoConfirmed,
        recurringGroupId: b.recurringGroupId,
        cancelRequestedAt: iso(b.cancelRequestedAt),
        canceledBy: b.canceledBy
          ? b.canceledBy === userId
            ? "나"
            : b.canceledBy === "SYSTEM"
              ? "자동"
              : "트레이너"
          : null,
        canceledAt: iso(b.canceledAt),
        deducted: b.deducted,
        deductReason: b.deductReason,
        deductSkippedReason: b.deductSkippedReason,
        rejectReason: b.rejectReason,
        approvalRequestedAt: iso(b.approvalRequestedAt),
        approvedAt: iso(b.approvedAt),
        approvalMethod: b.approvalMethod,
        trainerConfirmNeeded: b.trainerConfirmNeeded,
        disputed: b.disputed,
        disputeKind: b.disputeKind,
        disputeStudentReason: b.disputeStudentReason,
        disputeTrainerDecision: b.disputeTrainerDecision,
        disputeTrainerReason: b.disputeTrainerReason,
        disputeResolvedAt: iso(b.disputeResolvedAt),
        changeRequest: cr
          ? {
              id: cr.id,
              kind: cr.kind,
              mine: cr.requestedBy === userId,
              slots: slotsOf(cr.proposedSlots),
              expiresAt: cr.expiresAt.toISOString(),
            }
          : null,
        appliedRule: ruleText.get(b.id) ?? null,
        /** 처리할 일이 있으면 빨간 점 */
        needsAction:
          b.status === "PENDING_CONFIRM" ||
          (b.status === "PENDING_APPROVAL" && !b.disputed) ||
          (!!cr && cr.requestedBy !== userId && cr.kind === "CHANGE"),
      };
    }),
  };
}
