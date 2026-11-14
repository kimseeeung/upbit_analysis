import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { decideCancelDeduction } from "@/lib/booking/deduction";
import {
  STUDENT_REQUEST_LEAD_MS,
  canRequestChange,
  changeRequestExpiresAt,
  insufficientCancelAt,
  isWithinWorkingHours,
  weeklySlots,
  type TimeRange,
} from "@/lib/booking/schedule";
import { STATUS_LABEL } from "@/lib/booking/state-machine";
import { pickBookableDates } from "@/lib/rules/availability";
import { describeRules } from "@/lib/rules/rule-set";
import { onBookingEvent } from "@/server/notify/events";
import { toKstDateKey, toKstParts, kstDateTime } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import {
  getAvailableCount,
  loadCountInputs,
} from "@/server/passes/availability-service";
import {
  assertTrainerStudent,
  getStudentOfUser,
} from "@/server/students/access";
import {
  SYSTEM,
  assertNoOverlap,
  bookingPassContext,
  lockTrainer,
  logCreated,
  logTimeChange,
  sessionMinutesFor,
  transition,
} from "./core";
import { reconcileInsufficient } from "./insufficient";

const MINUTE = 60_000;
const MAX_PENDING_REQUESTS = 3;

type BookingRow = Prisma.BookingGetPayload<object>;

async function availabilityOf(tx: Db, trainerId: string) {
  const [rules, exceptions] = await Promise.all([
    tx.availabilityRule.findMany({ where: { trainerId } }),
    tx.availabilityException.findMany({ where: { trainerId } }),
  ]);
  return {
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
    })),
    exceptions: exceptions.map((e) => ({
      date: toKstDateKey(e.date),
      isOff: e.isOff,
      startTime: e.startTime,
      endTime: e.endTime,
    })),
  };
}

/** 다음 자동 알림이 실제로 나가는 시각 (21:00~08:00 야간이면 08:00) */
function nextDeliveryTime(now: Date): Date {
  const p = toKstParts(now);
  if (p.hour >= 21) {
    const t = kstDateTime(p.year, p.month, p.day, 8);
    return new Date(t.getTime() + 24 * 60 * MINUTE);
  }
  if (p.hour < 8) return kstDateTime(p.year, p.month, p.day, 8);
  return now;
}

function assertRange(start: Date, durationMinutes: number): TimeRange {
  if (Number.isNaN(start.getTime()))
    throw new AppError("INVALID", "시작 시각을 확인해 주세요");
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 10 ||
    durationMinutes > 240
  ) {
    throw new AppError("INVALID", "수업 시간은 10~240분이어야 합니다");
  }
  return { start, end: new Date(start.getTime() + durationMinutes * MINUTE) };
}

export type BookingWarning = "OUTSIDE_HOURS" | "RULE_UNAGREED" | "LATE_NOTICE";

export const WARNING_TEXT: Record<BookingWarning, string> = {
  OUTSIDE_HOURS: "근무 가능 시간 밖입니다",
  RULE_UNAGREED: "수강 규칙에 동의하지 않은 수강생입니다",
  LATE_NOTICE:
    "확정 요청이 수업 전에 닿지 않을 수 있습니다 (야간에는 알림이 08:00에 나갑니다)",
};

export interface TrainerCreateInput {
  trainerId: string;
  studentId: string;
  start: Date;
  durationMinutes?: number;
  memo?: string | null;
  /** 반복: 매주 고른 요일, 같은 시각, n회 */
  recurrence?: { weekdays: number[]; count: number } | null;
  /** 경고를 확인하고 그래도 등록 */
  acknowledgeWarnings?: boolean;
}

export type TrainerCreateResult =
  | {
      needsConfirmation: true;
      warnings: { code: BookingWarning; text: string }[];
    }
  | {
      needsConfirmation: false;
      created: string[];
      skippedInsufficient: number;
      skippedConflict: number;
      recurringGroupId: string | null;
    };

/**
 * 트레이너의 예약 등록 (4.4) → "확정 대기".
 * 막는 것: 예약 가능 횟수 0, 만료일 이후, 일시정지, 같은 시간 중복, 지난 시간.
 * 경고만 하는 것: 근무 시간 밖, 규칙 미동의, 늦은 시간.
 * 반복 예약은 예약 가능 횟수만큼만 만들고 나머지 수를 알려 준다.
 */
export async function createBookingsByTrainer(
  db: RootDb,
  input: TrainerCreateInput,
  now = new Date(),
): Promise<TrainerCreateResult> {
  return db.$transaction(async (tx) => {
    await assertTrainerStudent(tx, input.trainerId, input.studentId);
    await lockTrainer(tx, input.trainerId);
    // 트레이너가 고르는 수업 시간: 10분 단위 10~120분 (4.4)
    if (
      input.durationMinutes !== undefined &&
      (!Number.isInteger(input.durationMinutes) ||
        input.durationMinutes % 10 !== 0 ||
        input.durationMinutes < 10 ||
        input.durationMinutes > 120)
    )
      throw new AppError("INVALID", "수업 시간은 10분 단위로 10~120분입니다");
    const duration =
      input.durationMinutes ??
      (await sessionMinutesFor(tx, input.studentId, toKstDateKey(input.start)));
    const first = assertRange(input.start, duration);
    if (first.start <= now)
      throw new AppError("INVALID", "지난 시간에는 예약할 수 없습니다");

    const slots: TimeRange[] = input.recurrence
      ? weeklySlots({
          startDate: toKstDateKey(input.start),
          weekdays: input.recurrence.weekdays,
          time: `${String(toKstParts(input.start).hour).padStart(2, "0")}:${String(toKstParts(input.start).minute).padStart(2, "0")}`,
          durationMinutes: duration,
          count: Math.min(Math.max(1, input.recurrence.count), 52),
        }).filter((s) => s.start > now)
      : [first];
    if (slots.length === 0)
      throw new AppError("INVALID", "만들 수 있는 예약 날짜가 없습니다");

    // 경고
    if (!input.acknowledgeWarnings) {
      const warnings: BookingWarning[] = [];
      const av = await availabilityOf(tx, input.trainerId);
      if (slots.some((s) => !isWithinWorkingHours(s, av.rules, av.exceptions)))
        warnings.push("OUTSIDE_HOURS");
      const unagreed = await tx.pass.count({
        where: {
          studentId: input.studentId,
          status: { in: ["ACTIVE", "PAUSED"] },
          agreedRuleSetId: null,
        },
      });
      if (unagreed > 0) warnings.push("RULE_UNAGREED");
      if (nextDeliveryTime(now) >= slots[0].start) warnings.push("LATE_NOTICE");
      if (warnings.length > 0) {
        return {
          needsConfirmation: true,
          warnings: warnings.map((code) => ({
            code,
            text: WARNING_TEXT[code],
          })),
        };
      }
    }

    // 예약 가능 횟수만큼만 (앞 날짜부터)
    const { passes, bookings } = await loadCountInputs(tx, input.studentId);
    const pick = pickBookableDates(
      passes,
      bookings,
      slots.map((s) => ({
        date: toKstDateKey(s.start),
        startAt: s.start.toISOString(),
      })),
    );
    if (pick.bookable.length === 0) {
      throw new AppError(
        "NO_REMAINING",
        "예약 가능 횟수가 없습니다. 이용권을 추가해 주세요 (만료일 이후·일시정지 기간도 예약할 수 없습니다)",
      );
    }

    const groupId = slots.length > 1 ? randomUUID() : null;
    const created: string[] = [];
    let skippedConflict = 0;
    for (const i of pick.bookable) {
      const s = slots[i];
      try {
        await assertNoOverlap(tx, {
          trainerId: input.trainerId,
          studentId: input.studentId,
          range: s,
        });
      } catch (e) {
        if (slots.length === 1) throw e;
        skippedConflict += 1;
        continue;
      }
      const b = await tx.booking.create({
        data: {
          studentId: input.studentId,
          trainerId: input.trainerId,
          startAt: s.start,
          endAt: s.end,
          source: "TRAINER",
          status: "PENDING_CONFIRM",
          recurringGroupId: groupId,
          memo: input.memo?.trim() || null,
          createdBy: input.trainerId,
          createdAt: now,
        },
      });
      await logCreated(tx, b, input.trainerId, now);
      created.push(b.id);
    }
    if (created.length === 0)
      throw new AppError("OVERLAP", "이미 다른 수업이 있는 시간입니다");
    // 확정 요청 알림(웹 푸시 / 알림 못 받는 수강생은 카톡 공유)은 M5
    return {
      needsConfirmation: false,
      created,
      skippedInsufficient: pick.skipped.length,
      skippedConflict,
      recurringGroupId: groupId,
    };
  });
}

/**
 * 수강생의 예약 신청 (4.5) → "신청 대기".
 * 근무 시간 안, 수업 12시간 전까지, 대기 신청 3건까지, 예약 가능 횟수, 중복 검사.
 */
export async function requestBookingByStudent(
  db: RootDb,
  input: { userId: string; start: Date },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const student = await getStudentOfUser(tx, input.userId);
    if (!student.currentTrainerId)
      throw new AppError("NO_TRAINER", "담당 트레이너가 없습니다");
    const trainerId = student.currentTrainerId;
    await lockTrainer(tx, trainerId);
    const av = await availabilityOf(tx, trainerId);
    if (av.rules.length === 0) {
      throw new AppError(
        "NO_AVAILABILITY",
        "트레이너가 근무 가능 시간을 아직 설정하지 않았습니다",
      );
    }
    const dateKey = toKstDateKey(input.start);
    const range = assertRange(
      input.start,
      await sessionMinutesFor(tx, student.id, dateKey),
    );
    if (range.start.getTime() - now.getTime() < STUDENT_REQUEST_LEAD_MS) {
      throw new AppError("TOO_LATE", "수업 12시간 전까지만 신청할 수 있습니다");
    }
    if (!isWithinWorkingHours(range, av.rules, av.exceptions)) {
      throw new AppError(
        "OUTSIDE_HOURS",
        "트레이너의 예약 가능 시간이 아닙니다",
      );
    }
    const pending = await tx.booking.count({
      where: { studentId: student.id, status: "REQUESTED" },
    });
    if (pending >= MAX_PENDING_REQUESTS) {
      throw new AppError("TOO_MANY_REQUESTS", "대기 중인 신청은 3건까지입니다");
    }
    if ((await getAvailableCount(tx, student.id, dateKey)) <= 0) {
      throw new AppError(
        "NO_REMAINING",
        "예약 가능 횟수가 없습니다. 트레이너에게 이용권 추가를 요청해 주세요",
      );
    }
    await assertNoOverlap(tx, { trainerId, studentId: student.id, range });
    const b = await tx.booking.create({
      data: {
        studentId: student.id,
        trainerId,
        startAt: range.start,
        endAt: range.end,
        source: "STUDENT",
        status: "REQUESTED",
        createdBy: input.userId,
        createdAt: now,
      },
    });
    await logCreated(tx, b, input.userId, now);
    return b;
  });
}

async function loadForTrainer(
  tx: Db,
  trainerId: string,
  bookingId: string,
): Promise<BookingRow> {
  const b = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.trainerId !== trainerId)
    throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
  await assertTrainerStudent(tx, trainerId, b.studentId);
  return b;
}

async function loadForStudent(
  tx: Db,
  userId: string,
  bookingId: string,
): Promise<BookingRow> {
  const student = await getStudentOfUser(tx, userId);
  const b = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.studentId !== student.id)
    throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
  return b;
}

async function closeOpenChangeRequests(tx: Db, bookingId: string, now: Date) {
  await tx.bookingChangeRequest.updateMany({
    where: { bookingId, status: "PENDING" },
    data: { status: "CANCELED", respondedAt: now },
  });
}

/** 트레이너: 신청 수락·거절. 수락 시 예약 가능 횟수를 다시 확인 (4.5) */
export async function respondBookingRequest(
  db: RootDb,
  input: {
    trainerId: string;
    bookingId: string;
    accept: boolean;
    reason?: string;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await lockTrainer(tx, input.trainerId);
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    if (b.status !== "REQUESTED")
      throw new AppError(
        "INVALID_TRANSITION",
        "응답할 수 없는 예약입니다",
        409,
      );
    if (!input.accept) {
      await transition(tx, b, "REJECTED", {
        by: input.trainerId,
        reason: input.reason,
        now,
        data: { rejectReason: input.reason?.trim() || null },
      });
      return;
    }
    const available = await getAvailableCount(
      tx,
      b.studentId,
      toKstDateKey(b.startAt),
      { excludeBookingId: b.id },
    );
    if (available <= 0) {
      throw new AppError(
        "NO_REMAINING",
        "예약 가능 횟수가 없어 수락할 수 없습니다. 이용권을 추가해 주세요",
      );
    }
    await assertNoOverlap(tx, {
      trainerId: b.trainerId,
      studentId: b.studentId,
      range: { start: b.startAt, end: b.endAt },
      excludeBookingId: b.id,
    });
    await transition(tx, b, "CONFIRMED", { by: input.trainerId, now });
  });
}

/** 수강생: 대기 중인 신청 철회 */
export async function withdrawBookingRequest(
  db: RootDb,
  input: { userId: string; bookingId: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForStudent(tx, input.userId, input.bookingId);
    if (b.status !== "REQUESTED")
      throw new AppError(
        "INVALID_TRANSITION",
        "철회할 수 없는 예약입니다",
        409,
      );
    await transition(tx, b, "CANCELED", {
      by: input.userId,
      reason: "수강생이 신청 철회",
      now,
      data: {
        canceledAt: now,
        canceledBy: input.userId,
        cancelReason: "신청 철회",
      },
    });
  });
}

/** 수강생: 확정 요청 수락·거절. 반복 예약은 묶어서 한 번에 (4.4) */
export async function respondConfirmRequest(
  db: RootDb,
  input: {
    userId: string;
    bookingId: string;
    accept: boolean;
    reason?: string;
    wholeGroup?: boolean;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForStudent(tx, input.userId, input.bookingId);
    const targets =
      input.wholeGroup && b.recurringGroupId
        ? await tx.booking.findMany({
            where: {
              recurringGroupId: b.recurringGroupId,
              studentId: b.studentId,
              status: "PENDING_CONFIRM",
            },
            orderBy: { startAt: "asc" },
          })
        : [b];
    if (
      targets.length === 0 ||
      targets.some((t) => t.status !== "PENDING_CONFIRM")
    ) {
      throw new AppError(
        "INVALID_TRANSITION",
        "응답할 수 없는 예약입니다",
        409,
      );
    }
    for (const t of targets) {
      await closeOpenChangeRequests(tx, t.id, now);
      if (input.accept) {
        await transition(tx, t, "CONFIRMED", { by: input.userId, now });
      } else {
        await transition(tx, t, "REJECTED", {
          by: input.userId,
          reason: input.reason,
          now,
          data: { rejectReason: input.reason?.trim() || null },
        });
      }
    }
    return targets.length;
  });
}

function parseSlots(slots: readonly { start: Date; end: Date }[]): TimeRange[] {
  if (slots.length < 1 || slots.length > 3)
    throw new AppError("INVALID", "시간은 1~3개까지 고를 수 있습니다");
  for (const s of slots) {
    if (
      Number.isNaN(s.start.getTime()) ||
      Number.isNaN(s.end.getTime()) ||
      s.end <= s.start
    ) {
      throw new AppError("INVALID", "시간을 확인해 주세요");
    }
  }
  return slots.map((s) => ({ start: s.start, end: s.end }));
}

const slotJson = (s: TimeRange) => ({
  startAt: s.start.toISOString(),
  endAt: s.end.toISOString(),
});

/** 수강생: 확정 대기 예약에 다른 시간 제안 (1~3개, 4.4) */
export async function proposeOtherTimes(
  db: RootDb,
  input: {
    userId: string;
    bookingId: string;
    slots: { start: Date; end: Date }[];
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForStudent(tx, input.userId, input.bookingId);
    if (b.status !== "PENDING_CONFIRM")
      throw new AppError(
        "INVALID_TRANSITION",
        "제안할 수 없는 예약입니다",
        409,
      );
    const slots = parseSlots(input.slots);
    for (const s of slots) {
      if (s.start <= now)
        throw new AppError("INVALID", "지난 시간은 제안할 수 없습니다");
      await assertNoOverlap(tx, {
        trainerId: b.trainerId,
        studentId: b.studentId,
        range: s,
        excludeBookingId: b.id,
      });
    }
    await closeOpenChangeRequests(tx, b.id, now);
    const created = await tx.bookingChangeRequest.create({
      data: {
        bookingId: b.id,
        kind: "PROPOSAL",
        requestedBy: input.userId,
        proposedSlots: slots.map(slotJson),
        expiresAt: changeRequestExpiresAt(
          b.startAt,
          slots.map((s) => s.start),
        ),
        createdAt: now,
      },
    });
    await onBookingEvent(tx, b, "PROPOSAL", { by: input.userId }, now);
    return created;
  });
}

/** 트레이너: 확정 대기 예약을 직접 고침 (드래그) → 그대로 수정하고 확정 요청을 다시 보냄 */
export async function reschedulePendingByTrainer(
  db: RootDb,
  input: { trainerId: string; bookingId: string; start: Date; end: Date },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await lockTrainer(tx, input.trainerId);
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    if (b.status !== "PENDING_CONFIRM")
      throw new AppError(
        "INVALID_TRANSITION",
        "확정 대기 예약만 바로 고칠 수 있습니다",
        409,
      );
    const [range] = parseSlots([{ start: input.start, end: input.end }]);
    if (range.start <= now)
      throw new AppError("INVALID", "지난 시간으로 옮길 수 없습니다");
    if (
      (await getAvailableCount(tx, b.studentId, toKstDateKey(range.start), {
        excludeBookingId: b.id,
      })) <= 0
    ) {
      throw new AppError(
        "NO_REMAINING",
        "그 날짜에는 예약 가능 횟수가 없습니다",
      );
    }
    await assertNoOverlap(tx, {
      trainerId: b.trainerId,
      studentId: b.studentId,
      range,
      excludeBookingId: b.id,
    });
    await closeOpenChangeRequests(tx, b.id, now);
    await tx.booking.update({
      where: { id: b.id },
      data: { startAt: range.start, endAt: range.end },
    });
    await logTimeChange(tx, b, range, input.trainerId, now);
    // 확정 요청 다시 보내기(알림)는 M5
  });
}

/** 트레이너: 수강생이 제안한 시간 중 하나를 고르면 확정 (4.4) */
export async function chooseProposal(
  db: RootDb,
  input: { trainerId: string; requestId: string; index: number },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await lockTrainer(tx, input.trainerId);
    const req = await tx.bookingChangeRequest.findUnique({
      where: { id: input.requestId },
    });
    if (!req || req.kind !== "PROPOSAL" || req.status !== "PENDING") {
      throw new AppError("NOT_FOUND", "제안을 찾을 수 없습니다", 404);
    }
    const b = await loadForTrainer(tx, input.trainerId, req.bookingId);
    const slots = req.proposedSlots as { startAt: string; endAt: string }[];
    const chosen = slots[input.index];
    if (!chosen) throw new AppError("INVALID", "제안한 시간을 골라 주세요");
    const range = {
      start: new Date(chosen.startAt),
      end: new Date(chosen.endAt),
    };
    if (range.start <= now)
      throw new AppError("INVALID", "이미 지난 시간입니다");
    if (
      (await getAvailableCount(tx, b.studentId, toKstDateKey(range.start), {
        excludeBookingId: b.id,
      })) <= 0
    ) {
      throw new AppError(
        "NO_REMAINING",
        "그 날짜에는 예약 가능 횟수가 없습니다",
      );
    }
    await assertNoOverlap(tx, {
      trainerId: b.trainerId,
      studentId: b.studentId,
      range,
      excludeBookingId: b.id,
    });
    await tx.booking.update({
      where: { id: b.id },
      data: { startAt: range.start, endAt: range.end },
    });
    await logTimeChange(tx, b, range, input.trainerId, now);
    await tx.bookingChangeRequest.update({
      where: { id: req.id },
      data: {
        status: "ACCEPTED",
        chosenSlot: chosen,
        respondedAt: now,
        respondedBy: input.trainerId,
      },
    });
    await transition(
      tx,
      { ...b, startAt: range.start, endAt: range.end },
      "CONFIRMED",
      { by: input.trainerId, now },
    );
  });
}

/**
 * 확정된 예약의 시간 변경 요청 (4.6). 트레이너·수강생 모두 가능.
 * 기한: 규칙의 예약 변경 기한. 수락할 때까지 원래 시간 유지.
 */
export async function requestTimeChange(
  db: RootDb,
  input: {
    actorUserId: string;
    role: "TRAINER" | "STUDENT";
    bookingId: string;
    slots: { start: Date; end: Date }[];
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b =
      input.role === "TRAINER"
        ? await loadForTrainer(tx, input.actorUserId, input.bookingId)
        : await loadForStudent(tx, input.actorUserId, input.bookingId);
    if (b.status !== "CONFIRMED") {
      throw new AppError(
        "INVALID_TRANSITION",
        `${STATUS_LABEL[b.status]} 예약은 시간 변경을 요청할 수 없습니다`,
        409,
      );
    }
    if (b.cancelRequestedAt)
      throw new AppError("INVALID", "취소 요청 중인 예약입니다");
    const ctx = await bookingPassContext(tx, b);
    if (!canRequestChange(b.startAt, now, ctx.rules.changeDeadlineHours)) {
      throw new AppError(
        "TOO_LATE",
        `수업 ${ctx.rules.changeDeadlineHours}시간 전까지만 변경을 요청할 수 있습니다`,
      );
    }
    const slots = parseSlots(input.slots);
    for (const s of slots) {
      if (s.start <= now)
        throw new AppError("INVALID", "지난 시간으로 바꿀 수 없습니다");
      await assertNoOverlap(tx, {
        trainerId: b.trainerId,
        studentId: b.studentId,
        range: s,
        excludeBookingId: b.id,
      });
    }
    const pending = await tx.bookingChangeRequest.findFirst({
      where: { bookingId: b.id, status: "PENDING" },
    });
    if (pending && pending.requestedBy !== input.actorUserId) {
      throw new AppError(
        "PENDING_EXISTS",
        "상대방이 보낸 변경 요청에 먼저 응답해 주세요",
      );
    }
    await closeOpenChangeRequests(tx, b.id, now);
    const created = await tx.bookingChangeRequest.create({
      data: {
        bookingId: b.id,
        kind: "CHANGE",
        requestedBy: input.actorUserId,
        proposedSlots: slots.map(slotJson),
        expiresAt: changeRequestExpiresAt(
          b.startAt,
          slots.map((s) => s.start),
        ),
        createdAt: now,
      },
    });
    await onBookingEvent(
      tx,
      b,
      "CHANGE_REQUEST",
      { by: input.actorUserId },
      now,
    );
    return created;
  });
}

/** 변경 요청 응답: 수락(시간 선택) / 거절(원래 유지) / 다른 시간 제안 (4.6) */
export async function respondTimeChange(
  db: RootDb,
  input: {
    actorUserId: string;
    role: "TRAINER" | "STUDENT";
    requestId: string;
    action: "ACCEPT" | "REJECT" | "COUNTER";
    index?: number;
    slots?: { start: Date; end: Date }[];
  },
  now = new Date(),
) {
  const counterSlots =
    input.action === "COUNTER" ? parseSlots(input.slots ?? []) : [];
  return db.$transaction(async (tx) => {
    const req = await tx.bookingChangeRequest.findUnique({
      where: { id: input.requestId },
    });
    if (!req || req.kind !== "CHANGE" || req.status !== "PENDING") {
      throw new AppError("NOT_FOUND", "변경 요청을 찾을 수 없습니다", 404);
    }
    const b =
      input.role === "TRAINER"
        ? await loadForTrainer(tx, input.actorUserId, req.bookingId)
        : await loadForStudent(tx, input.actorUserId, req.bookingId);
    if (req.requestedBy === input.actorUserId)
      throw new AppError(
        "FORBIDDEN",
        "내가 보낸 요청에는 응답할 수 없습니다",
        403,
      );
    if (req.expiresAt <= now)
      throw new AppError("EXPIRED", "만료된 변경 요청입니다");
    if (b.status !== "CONFIRMED")
      throw new AppError(
        "INVALID_TRANSITION",
        "변경할 수 없는 예약입니다",
        409,
      );
    await lockTrainer(tx, b.trainerId);

    if (input.action === "REJECT") {
      await tx.bookingChangeRequest.update({
        where: { id: req.id },
        data: {
          status: "REJECTED",
          respondedAt: now,
          respondedBy: input.actorUserId,
        },
      });
      await onBookingEvent(
        tx,
        b,
        "CHANGE_RESULT",
        { by: input.actorUserId, text: "거절되어 원래 시간대로 진행합니다" },
        now,
      );
      return;
    }
    if (input.action === "COUNTER") {
      for (const s of counterSlots) {
        if (s.start <= now)
          throw new AppError("INVALID", "지난 시간은 제안할 수 없습니다");
        await assertNoOverlap(tx, {
          trainerId: b.trainerId,
          studentId: b.studentId,
          range: s,
          excludeBookingId: b.id,
        });
      }
      await tx.bookingChangeRequest.update({
        where: { id: req.id },
        data: {
          status: "COUNTERED",
          respondedAt: now,
          respondedBy: input.actorUserId,
        },
      });
      const created = await tx.bookingChangeRequest.create({
        data: {
          bookingId: b.id,
          kind: "CHANGE",
          requestedBy: input.actorUserId,
          proposedSlots: counterSlots.map(slotJson),
          expiresAt: changeRequestExpiresAt(
            b.startAt,
            counterSlots.map((s) => s.start),
          ),
          createdAt: now,
        },
      });
      await onBookingEvent(
        tx,
        b,
        "CHANGE_REQUEST",
        { by: input.actorUserId },
        now,
      );
      return created;
    }
    const slots = req.proposedSlots as { startAt: string; endAt: string }[];
    const chosen = slots[input.index ?? 0];
    if (!chosen) throw new AppError("INVALID", "시간을 골라 주세요");
    const range = {
      start: new Date(chosen.startAt),
      end: new Date(chosen.endAt),
    };
    if (
      (await getAvailableCount(tx, b.studentId, toKstDateKey(range.start), {
        excludeBookingId: b.id,
      })) <= 0
    ) {
      throw new AppError(
        "NO_REMAINING",
        "그 날짜에는 예약 가능 횟수가 없습니다",
      );
    }
    await assertNoOverlap(tx, {
      trainerId: b.trainerId,
      studentId: b.studentId,
      range,
      excludeBookingId: b.id,
    });
    await tx.booking.update({
      where: { id: b.id },
      data: { startAt: range.start, endAt: range.end },
    });
    await logTimeChange(
      tx,
      b,
      range,
      input.actorUserId,
      now,
      "booking.changeAccepted",
    );
    await tx.bookingChangeRequest.update({
      where: { id: req.id },
      data: {
        status: "ACCEPTED",
        chosenSlot: chosen,
        respondedAt: now,
        respondedBy: input.actorUserId,
      },
    });
    await onBookingEvent(
      tx,
      { ...b, startAt: range.start, endAt: range.end },
      "CHANGE_RESULT",
      { by: input.actorUserId, text: "수락되어 시간이 바뀌었습니다" },
      now,
    );
  });
}

/** 트레이너가 취소: 바로 취소, 차감 없음 (4.7) */
export async function cancelByTrainer(
  db: RootDb,
  input: { trainerId: string; bookingId: string; reason?: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    if (
      ![
        "PENDING_CONFIRM",
        "CONFIRMED",
        "INSUFFICIENT",
        "PENDING_APPROVAL",
      ].includes(b.status)
    ) {
      throw new AppError(
        "INVALID_TRANSITION",
        `${STATUS_LABEL[b.status]} 예약은 취소할 수 없습니다`,
        409,
      );
    }
    await closeOpenChangeRequests(tx, b.id, now);
    await transition(tx, b, "CANCELED", {
      by: input.trainerId,
      reason: input.reason ?? "트레이너 취소",
      now,
      data: {
        canceledAt: now,
        canceledBy: input.trainerId,
        cancelReason: input.reason?.trim() || "트레이너 취소",
      },
    });
    await reconcileInsufficient(tx, b.studentId, now);
  });
}

/** 수강생 취소 요청을 보내기 전에 보여 줄 차감 안내 */
export async function previewStudentCancel(
  db: Db,
  input: { userId: string; bookingId: string },
  now = new Date(),
) {
  const b = await loadForStudent(db, input.userId, input.bookingId);
  const ctx = await bookingPassContext(db, b);
  const d = decideCancelDeduction({
    kind: "STUDENT_REQUEST",
    startAt: b.startAt,
    requestedAt: now,
    rules: ctx.rules,
    ruleAgreed: ctx.agreed,
  });
  return { ...d, lateCancelHours: ctx.rules.lateCancelHours };
}

/** 수강생: 취소 요청 → 트레이너 수락 시 취소 (4.7). 확정 대기는 거절로 처리한다 */
export async function requestCancelByStudent(
  db: RootDb,
  input: { userId: string; bookingId: string; reason?: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForStudent(tx, input.userId, input.bookingId);
    if (b.status !== "CONFIRMED") {
      throw new AppError(
        "INVALID_TRANSITION",
        "예약 확정 상태에서만 취소를 요청할 수 있습니다",
        409,
      );
    }
    if (b.startAt <= now)
      throw new AppError("INVALID", "이미 시작한 수업입니다");
    if (b.cancelRequestedAt)
      throw new AppError("INVALID", "이미 취소를 요청했습니다");
    await closeOpenChangeRequests(tx, b.id, now);
    await tx.booking.update({
      where: { id: b.id },
      data: {
        cancelRequestedAt: now,
        cancelRequestedBy: input.userId,
        cancelRequestReason: input.reason?.trim() || null,
      },
    });
    await tx.bookingStatusLog.create({
      data: {
        bookingId: b.id,
        from: b.status,
        to: b.status,
        by: input.userId,
        reason: "취소 요청",
        at: now,
      },
    });
    await onBookingEvent(tx, b, "CANCEL_REQUEST", { by: input.userId }, now);
  });
}

/**
 * 취소 확정 (수락 또는 무응답 자동 취소). 차감은 요청 시각 기준 규칙.
 * 차감하면 이용권 배정 결과를 그 예약의 이용권으로 고정하고 잔여 부족을 다시 계산한다.
 */
async function finalizeStudentCancel(
  tx: Db,
  b: BookingRow,
  by: string,
  now: Date,
) {
  const ctx = await bookingPassContext(tx, b);
  const d = decideCancelDeduction({
    kind: "STUDENT_REQUEST",
    startAt: b.startAt,
    requestedAt: b.cancelRequestedAt,
    rules: ctx.rules,
    ruleAgreed: ctx.agreed,
  });
  await transition(tx, b, "CANCELED", {
    by,
    reason:
      by === SYSTEM ? "취소 요청 무응답 자동 취소" : "수강생 취소 요청 수락",
    now,
    data: {
      canceledAt: now,
      canceledBy: by,
      cancelReason: b.cancelRequestReason ?? "수강생 취소",
      deducted: d.deduct,
      deductReason: d.deduct ? "LATE_CANCEL" : null,
      lateCancel: d.lateCancel,
      deductSkippedReason: d.skippedReason,
      passId: d.deduct ? ctx.passId : b.passId,
    },
    notify: {
      deducted: d.deduct,
      skippedReason: d.skippedReason,
      ruleText: describeRules(ctx.rules).find((l) => l.title === "당일 취소")
        ?.text,
    },
  });
  if (d.deduct && ctx.passId) {
    await tx.pass.update({
      where: { id: ctx.passId },
      data: { deductedLateCancel: { increment: 1 } },
    });
  }
  await reconcileInsufficient(tx, b.studentId, now);
  return d;
}

/** 트레이너: 취소 요청 수락·거절 */
export async function respondCancelRequest(
  db: RootDb,
  input: {
    trainerId: string;
    bookingId: string;
    accept: boolean;
    reason?: string;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    if (b.status !== "CONFIRMED" || !b.cancelRequestedAt) {
      throw new AppError("INVALID", "취소 요청이 없는 예약입니다", 409);
    }
    if (input.accept) return finalizeStudentCancel(tx, b, input.trainerId, now);
    await tx.booking.update({
      where: { id: b.id },
      data: {
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        cancelRequestReason: null,
      },
    });
    await tx.bookingStatusLog.create({
      data: {
        bookingId: b.id,
        from: b.status,
        to: b.status,
        by: input.trainerId,
        reason: `취소 요청 거절${input.reason ? `: ${input.reason}` : ""}`,
        at: now,
      },
    });
    await onBookingEvent(
      tx,
      b,
      "CANCEL_REJECTED",
      { by: input.trainerId, text: input.reason },
      now,
    );
    return null;
  });
}

/**
 * 시간이 된 자동 처리 (pg-boss 연결은 M5, 지금은 이 함수를 주기적으로 부른다).
 * - 신청 대기: 수업 12시간 전 무응답 → 만료
 * - 확정 대기: 수업 시작까지 무응답 → 자동 확정
 * - 변경 요청·제안: 만료 시각 → 만료 (원래 시간 유지)
 * - 취소 요청: 수업 시작까지 무응답 → 자동 취소(요청 시각 기준 규칙)
 * - 잔여 부족: 24시간 전(또는 2시간 전)까지 해결 안 되면 차감 없이 취소
 */
export async function runBookingJobs(db: RootDb, now = new Date()) {
  const result = {
    expired: 0,
    autoConfirmed: 0,
    changeExpired: 0,
    autoCanceled: 0,
    insufficientCanceled: 0,
  };

  const expiring = await db.booking.findMany({
    where: {
      status: "REQUESTED",
      startAt: { lte: new Date(now.getTime() + STUDENT_REQUEST_LEAD_MS) },
    },
  });
  for (const b of expiring) {
    await db.$transaction((tx) =>
      transition(tx, b, "EXPIRED", {
        by: SYSTEM,
        reason: "수업 12시간 전 무응답",
        now,
      }),
    );
    result.expired += 1;
  }

  const confirming = await db.booking.findMany({
    where: { status: "PENDING_CONFIRM", startAt: { lte: now } },
  });
  for (const b of confirming) {
    await db.$transaction(async (tx) => {
      await closeOpenChangeRequests(tx, b.id, now);
      await transition(tx, b, "CONFIRMED", {
        by: SYSTEM,
        reason: "무응답 자동 확정",
        now,
        data: { autoConfirmed: true },
      });
    });
    result.autoConfirmed += 1;
  }

  const ch = await db.bookingChangeRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });
  result.changeExpired = ch.count;

  const cancelReqs = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      cancelRequestedAt: { not: null },
      startAt: { lte: now },
    },
  });
  for (const b of cancelReqs) {
    await db.$transaction((tx) => finalizeStudentCancel(tx, b, SYSTEM, now));
    result.autoCanceled += 1;
  }

  const short = await db.booking.findMany({
    where: { status: "INSUFFICIENT" },
  });
  for (const b of short) {
    if (insufficientCancelAt(b.startAt, b.insufficientAt ?? now) > now)
      continue;
    await db.$transaction((tx) =>
      transition(tx, b, "CANCELED", {
        by: SYSTEM,
        reason: "잔여 부족 미해결 자동 취소",
        now,
        data: {
          canceledAt: now,
          canceledBy: SYSTEM,
          cancelReason: "잔여 횟수 부족",
        },
      }),
    );
    result.insufficientCanceled += 1;
  }
  return result;
}
