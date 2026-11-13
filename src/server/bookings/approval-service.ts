import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  correctionDeadline,
  decideApprovalDeadline,
  decideNoShowDeduction,
  isDisputeOverdue,
  noShowAllowedAt,
} from "@/lib/booking/deduction";
import { verifySecret } from "@/lib/auth/hash";
import {
  PIN_LOCK,
  isLocked,
  registerFailure,
  registerSuccess,
} from "@/lib/auth/lockout";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import {
  assertTrainerStudent,
  getStudentOfUser,
} from "@/server/students/access";
import { SYSTEM, bookingPassContext, transition } from "./core";
import { reconcileInsufficient } from "./insufficient";

type BookingRow = Prisma.BookingGetPayload<object>;

async function loadForTrainer(tx: Db, trainerId: string, bookingId: string) {
  const b = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.trainerId !== trainerId)
    throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
  await assertTrainerStudent(tx, trainerId, b.studentId);
  return b;
}

async function loadForStudent(tx: Db, userId: string, bookingId: string) {
  const student = await getStudentOfUser(tx, userId);
  const b = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.studentId !== student.id)
    throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
  return b;
}

const COUNTER = {
  COMPLETED: "usedCount",
  NO_SHOW: "deductedNoShow",
  LATE_CANCEL: "deductedLateCancel",
} as const;

/** 수업 종료 → 완료 승인 대기 + 승인 요청 (5.1). 알림은 M5 */
export async function startApproval(tx: Db, b: BookingRow, now: Date) {
  await transition(tx, b, "PENDING_APPROVAL", {
    by: SYSTEM,
    reason: "수업 종료, 완료 승인 요청",
    now,
    data: { approvalRequestedAt: now, approvalRequestedBy: b.trainerId },
  });
}

/** 완료 처리: 1회 차감 (규칙 동의와 관계없음) */
async function complete(
  tx: Db,
  b: BookingRow,
  method:
    | "PIN_ONSITE"
    | "PIN_APP"
    | "AUTO"
    | "TRAINER_CONFIRM"
    | "DISPUTE_RESOLUTION",
  by: string,
  now: Date,
  extra: Prisma.BookingUncheckedUpdateManyInput = {},
) {
  const ctx = await bookingPassContext(tx, b);
  await transition(tx, b, "COMPLETED", {
    by,
    reason: `완료 (${method})`,
    now,
    viaDispute: method === "DISPUTE_RESOLUTION",
    data: {
      ...extra,
      approvedAt: now,
      approvalMethod: method,
      trainerConfirmNeeded: false,
      deducted: !!ctx.passId,
      deductReason: ctx.passId ? "COMPLETED" : null,
      deductSkippedReason: ctx.passId ? null : "NO_PASS",
      passId: ctx.passId,
    },
  });
  if (ctx.passId)
    await tx.pass.update({
      where: { id: ctx.passId },
      data: { usedCount: { increment: 1 } },
    });
  await reconcileInsufficient(tx, b.studentId, now);
}

/**
 * PIN으로 완료 승인. 현장(트레이너 기기에서 수강생이 PIN 입력) 또는 앱(수강생 요청함).
 * PIN 5회 오류 시 잠금 → 본인인증 후 재설정. 실패 횟수는 승인 실패와 별개로 저장한다.
 */
export async function approveWithPin(
  db: RootDb,
  input: { bookingId: string; pin: string } & (
    | { method: "PIN_ONSITE"; trainerId: string }
    | { method: "PIN_APP"; studentUserId: string }
  ),
  now = new Date(),
) {
  const b =
    input.method === "PIN_ONSITE"
      ? await loadForTrainer(db, input.trainerId, input.bookingId)
      : await loadForStudent(db, input.studentUserId, input.bookingId);
  if (b.status !== "PENDING_APPROVAL") {
    throw new AppError(
      "INVALID_TRANSITION",
      "완료 승인 대기 중인 수업이 아닙니다",
      409,
    );
  }
  if (b.disputed) throw new AppError("DISPUTED", "이견 처리 중인 수업입니다");
  const student = await db.student.findUniqueOrThrow({
    where: { id: b.studentId },
    include: { user: { include: { studentProfile: true } } },
  });
  const profile = student.user?.studentProfile;
  if (!student.user || !profile) {
    throw new AppError(
      "NOT_REGISTERED",
      "가입하지 않은 수강생은 PIN으로 승인할 수 없습니다. 가입 후 승인해 주세요",
    );
  }
  const lock = {
    failCount: profile.pinFailCount,
    lockedUntil: profile.pinLockedUntil,
  };
  if (isLocked(lock, now)) {
    throw new AppError(
      "PIN_LOCKED",
      "PIN을 5회 잘못 입력해 잠겼습니다. 본인인증 후 PIN을 다시 설정해 주세요",
      423,
    );
  }
  const ok =
    /^\d{4}$/.test(input.pin) &&
    (await verifySecret(input.pin, {
      hash: profile.pinHash,
      salt: profile.pinSalt,
    }));
  if (!ok) {
    const next = registerFailure(lock, now, PIN_LOCK);
    await db.studentProfile.update({
      where: { id: profile.id },
      data: { pinFailCount: next.failCount, pinLockedUntil: next.lockedUntil },
    });
    if (next.lockedUntil) {
      throw new AppError(
        "PIN_LOCKED",
        "PIN을 5회 잘못 입력해 잠겼습니다. 본인인증 후 PIN을 다시 설정해 주세요",
        423,
      );
    }
    throw new AppError(
      "WRONG_PIN",
      `PIN이 맞지 않습니다 (남은 횟수 ${PIN_LOCK.maxFails - next.failCount}회)`,
    );
  }
  const reset = registerSuccess();
  await db.$transaction(async (tx) => {
    await tx.studentProfile.update({
      where: { id: profile.id },
      data: {
        pinFailCount: reset.failCount,
        pinLockedUntil: reset.lockedUntil,
      },
    });
    const fresh = await tx.booking.findUniqueOrThrow({ where: { id: b.id } });
    await complete(
      tx,
      fresh,
      input.method,
      input.method === "PIN_ONSITE" ? input.trainerId : input.studentUserId,
      now,
    );
  });
}

/** 트레이너: 노쇼 처리. 예약 확정은 시작 + 판정 시간 뒤부터, 완료 승인 대기는 종료 후 24시간 안 */
export async function markNoShow(
  db: RootDb,
  input: { trainerId: string; bookingId: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    const ctx = await bookingPassContext(tx, b);
    if (
      b.status === "CONFIRMED" &&
      now < noShowAllowedAt(b.startAt, ctx.rules)
    ) {
      throw new AppError(
        "TOO_EARLY",
        `수업 시작 후 ${ctx.rules.noShowMinutes}분이 지나야 노쇼로 처리할 수 있습니다`,
      );
    }
    if (b.status === "PENDING_APPROVAL" && now > correctionDeadline(b.endAt)) {
      throw new AppError(
        "TOO_LATE",
        "수업 종료 후 24시간이 지나 노쇼로 바꿀 수 없습니다",
      );
    }
    const d = decideNoShowDeduction({
      rules: ctx.rules,
      ruleAgreed: ctx.agreed,
    });
    await transition(tx, b, "NO_SHOW", {
      by: input.trainerId,
      reason: "트레이너 노쇼 처리",
      now,
      data: {
        deducted: d.deduct && !!ctx.passId,
        deductReason: d.deduct && ctx.passId ? "NO_SHOW" : null,
        deductSkippedReason: d.skippedReason,
        passId: d.deduct ? ctx.passId : b.passId,
        trainerConfirmNeeded: false,
      },
    });
    if (d.deduct && ctx.passId) {
      await tx.pass.update({
        where: { id: ctx.passId },
        data: { deductedNoShow: { increment: 1 } },
      });
    }
    await reconcileInsufficient(tx, b.studentId, now);
    // 차감 알림(적용 규칙 포함)은 M5
    return {
      deducted: d.deduct && !!ctx.passId,
      skippedReason: d.skippedReason,
      rules: ctx.rules,
    };
  });
}

/** 트레이너 확정: 미동의 수강생의 미승인 기한이 지난 뒤 트레이너가 직접 완료 처리 */
export async function trainerConfirmCompletion(
  db: RootDb,
  input: { trainerId: string; bookingId: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    if (
      b.status !== "PENDING_APPROVAL" ||
      !b.trainerConfirmNeeded ||
      b.disputed
    ) {
      throw new AppError(
        "INVALID",
        "트레이너 확정이 필요한 수업이 아닙니다",
        409,
      );
    }
    await complete(tx, b, "TRAINER_CONFIRM", input.trainerId, now);
  });
}

/** 수강생: 완료 승인 거절 / 노쇼 이의 제기 (5.2). 한 수업에 한 번만 */
export async function raiseDispute(
  db: RootDb,
  input: { studentUserId: string; bookingId: string; reason: string },
  now = new Date(),
) {
  const reason = input.reason.trim();
  if (!reason) throw new AppError("INVALID", "사유를 입력해 주세요");
  return db.$transaction(async (tx) => {
    const b = await loadForStudent(tx, input.studentUserId, input.bookingId);
    if (b.disputeAt)
      throw new AppError(
        "ALREADY",
        "이미 이의를 제기한 수업입니다. 다시 요청할 수 없습니다",
      );
    const kind =
      b.status === "PENDING_APPROVAL"
        ? "COMPLETION_REJECTED"
        : b.status === "NO_SHOW"
          ? "NO_SHOW_OBJECTION"
          : null;
    if (!kind)
      throw new AppError("INVALID", "이의를 제기할 수 없는 수업입니다");
    const r = await tx.booking.updateMany({
      where: { id: b.id, status: b.status, disputeAt: null },
      data: {
        disputed: true,
        disputeKind: kind,
        disputeStudentReason: reason.slice(0, 500),
        disputeAt: now,
      },
    });
    if (r.count !== 1)
      throw new AppError(
        "CONFLICT",
        "예약이 방금 바뀌었습니다. 새로고침해 주세요",
        409,
      );
    await tx.bookingStatusLog.create({
      data: {
        bookingId: b.id,
        from: b.status,
        to: b.status,
        by: input.studentUserId,
        reason:
          kind === "COMPLETION_REJECTED"
            ? `완료 승인 거절: ${reason}`
            : `노쇼 이의 제기: ${reason}`,
        at: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: input.studentUserId },
      entity: "Booking",
      entityId: b.id,
      action:
        kind === "COMPLETION_REJECTED"
          ? "booking.rejectCompletion"
          : "booking.objectNoShow",
      after: { reason },
      at: now,
    });
  });
}

async function resolve(
  tx: Db,
  b: BookingRow,
  decision: "ACCEPT_STUDENT" | "KEEP",
  by: string,
  now: Date,
  reason?: string,
) {
  if (!b.disputed || b.disputeResolvedAt)
    throw new AppError("INVALID", "처리할 이의가 없습니다", 409);
  const meta = {
    disputeTrainerDecision: decision,
    disputeTrainerReason: reason?.trim() || null,
    disputeResolvedAt: now,
  } as const;
  if (b.disputeKind === "COMPLETION_REJECTED") {
    if (decision === "KEEP") {
      await complete(tx, b, "DISPUTE_RESOLUTION", by, now, meta);
    } else {
      // 수강생 의견 수락: 수업을 인정하지 않음 → 차감 없이 취소
      await transition(tx, b, "CANCELED", {
        by,
        reason: "이견 처리: 수강생 의견 수락",
        now,
        viaDispute: true,
        data: {
          ...meta,
          canceledAt: now,
          canceledBy: by,
          cancelReason: "완료 거절 수락",
          approvalMethod: "DISPUTE_RESOLUTION",
        },
      });
    }
  } else {
    if (decision === "KEEP") {
      await tx.booking.update({ where: { id: b.id }, data: meta });
    } else {
      // 노쇼 취소 + 차감 되돌림
      await transition(tx, b, "CANCELED", {
        by,
        reason: "이견 처리: 노쇼 이의 수락",
        now,
        viaDispute: true,
        data: {
          ...meta,
          canceledAt: now,
          canceledBy: by,
          cancelReason: "노쇼 이의 수락",
          deducted: false,
          deductReason: null,
          approvalMethod: "DISPUTE_RESOLUTION",
        },
      });
      if (b.deducted && b.passId && b.deductReason) {
        await tx.pass.update({
          where: { id: b.passId },
          data: { [COUNTER[b.deductReason]]: { decrement: 1 } },
        });
      }
      await reconcileInsufficient(tx, b.studentId, now);
    }
  }
}

/** 트레이너: 이견 처리 — "수강생 의견 수락" / "기존 처리 유지". 선택하면 종결 */
export async function resolveDispute(
  db: RootDb,
  input: {
    trainerId: string;
    bookingId: string;
    decision: "ACCEPT_STUDENT" | "KEEP";
    reason?: string;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const b = await loadForTrainer(tx, input.trainerId, input.bookingId);
    await resolve(tx, b, input.decision, input.trainerId, now, input.reason);
  });
}

/**
 * 시간이 된 완료 승인 처리.
 * - 수업 종료: 예약 확정 → 완료 승인 대기
 * - 미승인 기한: 동의함 → 자동 완료 / 미동의 → 트레이너 확정 필요 표시 (알림은 M5)
 * - 이견 처리 기한: 7일 무응답 → 수강생 의견 수락
 */
export async function runApprovalJobs(db: RootDb, now = new Date()) {
  const result = {
    approvalStarted: 0,
    autoCompleted: 0,
    trainerConfirmNeeded: 0,
    disputesResolved: 0,
  };

  const ended = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      endAt: { lte: now },
      cancelRequestedAt: null,
    },
  });
  for (const b of ended) {
    await db.$transaction((tx) => startApproval(tx, b, now));
    result.approvalStarted += 1;
  }

  const waiting = await db.booking.findMany({
    where: {
      status: "PENDING_APPROVAL",
      disputed: false,
      trainerConfirmNeeded: false,
      approvalRequestedAt: { not: null },
    },
  });
  for (const b of waiting) {
    await db.$transaction(async (tx) => {
      const ctx = await bookingPassContext(tx, b);
      const action = decideApprovalDeadline({
        approvalRequestedAt: b.approvalRequestedAt!,
        now,
        rules: ctx.rules,
        ruleAgreed: ctx.agreed,
        disputed: b.disputed,
      });
      if (action === "AUTO_COMPLETE") {
        await complete(tx, b, "AUTO", SYSTEM, now);
        result.autoCompleted += 1;
      } else if (action === "NEEDS_TRAINER_CONFIRM") {
        await tx.booking.update({
          where: { id: b.id },
          data: { trainerConfirmNeeded: true },
        });
        result.trainerConfirmNeeded += 1;
      }
    });
  }

  const disputes = await db.booking.findMany({
    where: {
      disputed: true,
      disputeResolvedAt: null,
      disputeAt: { not: null },
    },
  });
  for (const b of disputes) {
    if (!isDisputeOverdue(b.disputeAt!, now)) continue;
    await db.$transaction((tx) =>
      resolve(tx, b, "ACCEPT_STUDENT", SYSTEM, now, "7일 무응답"),
    );
    result.disputesResolved += 1;
  }
  return result;
}
