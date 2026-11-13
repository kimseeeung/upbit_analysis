import type { BookingStatus, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  OCCUPYING,
  TransitionError,
  assertTransition,
} from "@/lib/booking/state-machine";
import { overlaps, type TimeRange } from "@/lib/booking/schedule";
import { allocateBookings } from "@/lib/rules/availability";
import {
  DEFAULT_RULES,
  pickRuleValues,
  type RuleValues,
} from "@/lib/rules/rule-set";
import { toKstDateKey } from "@/lib/time";
import { onBookingCreated, onBookingTransition } from "@/server/notify/events";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { loadCountInputs } from "@/server/passes/availability-service";
import {
  effectiveRules,
  getTrainerDefaultRuleSet,
} from "@/server/rules/rule-service";

export const SYSTEM = "SYSTEM";

type BookingRow = Prisma.BookingGetPayload<object>;

/** 같은 트레이너의 예약 변경을 한 번에 하나씩 처리해 시간 겹침 경쟁을 막는다 */
export async function lockTrainer(tx: Db, trainerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trainer:${trainerId}`}))`;
}

/**
 * 같은 시간 중복 차단 (4.1): 1:1 수업만 지원하므로 트레이너 일정과 수강생 일정 모두
 * 겹치는 시간에는 예약·신청·변경 불가.
 */
export async function assertNoOverlap(
  tx: Db,
  input: {
    trainerId: string;
    studentId: string;
    range: TimeRange;
    excludeBookingId?: string;
  },
) {
  const rows = await tx.booking.findMany({
    where: {
      status: { in: [...OCCUPYING] },
      OR: [{ trainerId: input.trainerId }, { studentId: input.studentId }],
      startAt: { lt: input.range.end },
      endAt: { gt: input.range.start },
      ...(input.excludeBookingId
        ? { id: { not: input.excludeBookingId } }
        : {}),
    },
    select: { id: true, startAt: true, endAt: true },
  });
  if (
    rows.some((r) => overlaps({ start: r.startAt, end: r.endAt }, input.range))
  ) {
    throw new AppError("OVERLAP", "이미 다른 수업이 있는 시간입니다");
  }
}

/** 상태를 바꾸고 상태 이력·감사 로그를 남긴다. 다른 요청이 먼저 바꿨으면 실패 */
export async function transition(
  tx: Db,
  booking: BookingRow,
  to: BookingStatus,
  opts: {
    by: string;
    reason?: string;
    now: Date;
    data?: Prisma.BookingUncheckedUpdateManyInput;
    viaDispute?: boolean;
    notify?: {
      deducted?: boolean;
      skippedReason?: string | null;
      ruleText?: string | null;
    };
  },
): Promise<void> {
  try {
    assertTransition(booking.status, to, {
      now: opts.now,
      startAt: booking.startAt,
      endAt: booking.endAt,
      prevStatus: booking.prevStatus,
      viaDispute: opts.viaDispute,
    });
  } catch (e) {
    if (e instanceof TransitionError)
      throw new AppError("INVALID_TRANSITION", e.message, 409);
    throw e;
  }
  const r = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: { ...opts.data, status: to },
  });
  if (r.count !== 1) {
    throw new AppError(
      "CONFLICT",
      "예약이 방금 바뀌었습니다. 새로고침 후 다시 시도해 주세요",
      409,
    );
  }
  await tx.bookingStatusLog.create({
    data: {
      bookingId: booking.id,
      from: booking.status,
      to,
      by: opts.by,
      reason: opts.reason ?? null,
      at: opts.now,
    },
  });
  // 알림 (8.2): 바뀐 값으로 다시 읽어 보낸다
  const updated = await tx.booking.findUniqueOrThrow({
    where: { id: booking.id },
  });
  await onBookingTransition(
    tx,
    updated,
    booking.status,
    to,
    opts.by,
    opts.now,
    opts.notify,
  );
  await writeAuditLog(tx, {
    actor:
      opts.by === SYSTEM ? { type: "SYSTEM" } : { type: "USER", id: opts.by },
    entity: "Booking",
    entityId: booking.id,
    action: `booking.${to.toLowerCase()}`,
    before: { status: booking.status },
    after: {
      status: to,
      reason: opts.reason,
      ...((opts.data as object) ?? {}),
    },
    at: opts.now,
  });
}

export async function logCreated(
  tx: Db,
  booking: BookingRow,
  by: string,
  now: Date,
) {
  await tx.bookingStatusLog.create({
    data: {
      bookingId: booking.id,
      from: null,
      to: booking.status,
      by,
      at: now,
    },
  });
  await onBookingCreated(tx, booking, now);
  await writeAuditLog(tx, {
    actor: by === SYSTEM ? { type: "SYSTEM" } : { type: "USER", id: by },
    entity: "Booking",
    entityId: booking.id,
    action: "booking.create",
    after: {
      status: booking.status,
      studentId: booking.studentId,
      trainerId: booking.trainerId,
      startAt: booking.startAt,
      endAt: booking.endAt,
      recurringGroupId: booking.recurringGroupId,
    },
    at: now,
  });
}

/** 예약 시간 변경 기록 */
export async function logTimeChange(
  tx: Db,
  booking: BookingRow,
  next: TimeRange,
  by: string,
  now: Date,
  action = "booking.reschedule",
) {
  await writeAuditLog(tx, {
    actor: by === SYSTEM ? { type: "SYSTEM" } : { type: "USER", id: by },
    entity: "Booking",
    entityId: booking.id,
    action,
    before: { startAt: booking.startAt, endAt: booking.endAt },
    after: { startAt: next.start, endAt: next.end },
    at: now,
  });
}

/**
 * 이 예약에 적용할 이용권·규칙.
 * 차감된 예약은 차감한 이용권, 예정 예약은 배정 결과(이전 이용권부터)를 따른다.
 * 배정된 이용권이 없으면 트레이너 기본 규칙을 "미동의"로 적용한다.
 */
export async function bookingPassContext(
  tx: Db,
  booking: Pick<BookingRow, "id" | "studentId" | "trainerId" | "passId">,
): Promise<{ passId: string | null; rules: RuleValues; agreed: boolean }> {
  let passId = booking.passId;
  if (!passId) {
    const { passes, bookings } = await loadCountInputs(tx, booking.studentId);
    passId = allocateBookings(passes, bookings).assignment[booking.id] ?? null;
  }
  if (!passId) {
    const base = await getTrainerDefaultRuleSet(tx, booking.trainerId);
    return { passId: null, rules: pickRuleValues(base), agreed: false };
  }
  const pass = await tx.pass.findUniqueOrThrow({ where: { id: passId } });
  const eff = effectiveRules(pass);
  const rs = await tx.ruleSet.findUnique({ where: { id: eff.ruleSetId } });
  return {
    passId,
    rules: rs ? pickRuleValues(rs) : DEFAULT_RULES,
    agreed: eff.agreed,
  };
}

/** 이용권 기본 수업 시간: 그 날짜에 쓸 이용권의 1회 수업 시간, 없으면 50분 */
export async function sessionMinutesFor(
  tx: Db,
  studentId: string,
  dateKey: string,
): Promise<number> {
  const passes = await tx.pass.findMany({
    where: { studentId, status: { notIn: ["REFUNDED", "SUSPENDED"] } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  const p = passes.find(
    (x) =>
      toKstDateKey(x.startDate) <= dateKey &&
      dateKey <= toKstDateKey(x.endDate),
  );
  return p?.sessionMinutes ?? 50;
}
