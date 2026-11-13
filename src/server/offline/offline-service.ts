import { addKstDays, toKstDateKey } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { approveWithPin, markNoShow } from "@/server/bookings/approval-service";
import {
  cancelByTrainer,
  createBookingsByTrainer,
  requestTimeChange,
  reschedulePendingByTrainer,
} from "@/server/bookings/booking-service";
import {
  getStudentCalendar,
  getTrainerCalendar,
} from "@/server/bookings/calendar-service";
import {
  getStudentDetailForTrainer,
  getMyPasses,
} from "@/server/students/detail-service";
import {
  listTrainerStudents,
  updateTrainerMemo,
} from "@/server/students/student-service";
import { getTrainerDefaultRuleSet } from "@/server/rules/rule-service";
import { getStudentOfUser } from "@/server/students/access";

/**
 * 휴대폰 백업 내용 (11.1).
 * 트레이너: 내 수강생, 이용권, 규칙, 알림 설정, 예약(지난 3개월~앞으로 3개월)
 * 수강생: 내 예약, 이용권, 이력. 센터 관리자: 1차 미지원.
 */
export async function buildSnapshot(
  db: Db,
  input: { userId: string; role: "TRAINER" | "STUDENT" | "CENTER_ADMIN" },
  now = new Date(),
) {
  const from = toKstDateKey(addKstDays(now, -92));
  const to = toKstDateKey(addKstDays(now, 92));
  if (input.role === "TRAINER") {
    const students = await listTrainerStudents(
      db,
      input.userId,
      { filter: "ALL" },
      now,
    );
    const details = [];
    for (const s of students)
      details.push(
        await getStudentDetailForTrainer(db, input.userId, s.studentId, now),
      );
    const calendar = await getTrainerCalendar(
      db,
      input.userId,
      from,
      to,
      now,
      200,
    );
    const rules = await getTrainerDefaultRuleSet(db, input.userId);
    const profile = await db.trainerProfile.findUnique({
      where: { userId: input.userId },
    });
    return {
      role: input.role,
      generatedAt: now.toISOString(),
      from,
      to,
      students,
      details,
      calendar,
      rules,
      dayBeforeNotifyTime: profile?.dayBeforeNotifyTime ?? "20:00",
    };
  }
  if (input.role === "STUDENT") {
    const student = await getStudentOfUser(db, input.userId);
    const calendar = await getStudentCalendar(
      db,
      input.userId,
      from,
      to,
      now,
      200,
    );
    const passes = await getMyPasses(db, student.id, now);
    return {
      role: input.role,
      generatedAt: now.toISOString(),
      from,
      to,
      calendar,
      passes,
    };
  }
  return null;
}

export type OfflineOp =
  | {
      kind: "CREATE_BOOKING";
      payload: {
        studentId: string;
        startAt: string;
        durationMinutes?: number;
        memo?: string | null;
      };
    }
  | {
      kind: "CANCEL_BOOKING";
      payload: { bookingId: string; reason?: string; baseUpdatedAt: string };
    }
  | { kind: "NO_SHOW"; payload: { bookingId: string; baseUpdatedAt: string } }
  | {
      kind: "RESCHEDULE";
      payload: {
        bookingId: string;
        startAt: string;
        endAt: string;
        baseUpdatedAt: string;
      };
    }
  | { kind: "MEMO"; payload: { studentId: string; memo: string } }
  | { kind: "ONSITE_APPROVE"; payload: { bookingId: string; pin: string } };

export interface QueuedOp {
  id: string;
  createdAt: string;
  device: string;
  op: OfflineOp;
}

export type OpResult =
  | { id: string; status: "APPLIED" }
  | { id: string; status: "CONFLICT"; conflictId: string; reason: string }
  | { id: string; status: "PIN_FAILED"; reason: string }
  | { id: string; status: "FAILED"; reason: string };

const KIND_LABEL: Record<OfflineOp["kind"], string> = {
  CREATE_BOOKING: "예약 등록",
  CANCEL_BOOKING: "예약 취소",
  NO_SHOW: "노쇼 처리",
  RESCHEDULE: "시간 변경",
  MEMO: "메모",
  ONSITE_APPROVE: "현장 완료 승인",
};

async function conflict(
  db: Db,
  trainerId: string,
  q: QueuedOp,
  entity: string,
  entityId: string | null,
  reason: string,
  server: unknown,
) {
  const c = await db.syncConflict.create({
    data: {
      trainerId,
      kind: q.op.kind,
      entity,
      entityId,
      localChange: q.op.payload as object,
      serverState: (server ?? null) as object,
      reason,
      deviceLabel: q.device.slice(0, 100),
      localAt: new Date(q.createdAt),
    },
  });
  return { id: q.id, status: "CONFLICT" as const, conflictId: c.id, reason };
}

/** 같은 예약을 다른 기기에서도 바꿨는가 (휴대폰이 알던 시각 뒤에 바뀜) */
async function changedSince(db: Db, bookingId: string, base: string) {
  const b = await db.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { changed: true, booking: null };
  return {
    changed: b.updatedAt.getTime() > new Date(base).getTime(),
    booking: b,
  };
}

async function applyOne(
  db: RootDb,
  trainerId: string,
  q: QueuedOp,
  now: Date,
  force = false,
): Promise<OpResult> {
  const origin = { device: q.device, at: q.createdAt };
  const op = q.op;
  try {
    if (op.kind === "CREATE_BOOKING") {
      const r = await createBookingsByTrainer(
        db,
        {
          trainerId,
          studentId: op.payload.studentId,
          start: new Date(op.payload.startAt),
          durationMinutes: op.payload.durationMinutes,
          memo: op.payload.memo,
          acknowledgeWarnings: true,
        },
        now,
      );
      if (!r.needsConfirmation) {
        await db.booking.updateMany({
          where: { id: { in: r.created } },
          data: { offlineOrigin: origin },
        });
      }
      return { id: q.id, status: "APPLIED" };
    }
    if (op.kind === "MEMO") {
      await updateTrainerMemo(
        db,
        trainerId,
        op.payload.studentId,
        op.payload.memo,
      );
      return { id: q.id, status: "APPLIED" };
    }
    if (op.kind === "ONSITE_APPROVE") {
      try {
        await approveWithPin(
          db,
          {
            method: "PIN_ONSITE",
            trainerId,
            bookingId: op.payload.bookingId,
            pin: op.payload.pin,
          },
          now,
        );
      } catch (e) {
        // 서버 PIN 검증 실패: 승인을 취소하고 승인 요청으로 둔다 (11.3)
        if (
          e instanceof AppError &&
          (e.code === "WRONG_PIN" || e.code === "PIN_LOCKED")
        ) {
          return {
            id: q.id,
            status: "PIN_FAILED",
            reason: `현장 승인 확인 실패: ${e.message}. 승인 요청으로 남겼습니다`,
          };
        }
        throw e;
      }
      return { id: q.id, status: "APPLIED" };
    }
    const { changed, booking } = await changedSince(
      db,
      op.payload.bookingId,
      op.payload.baseUpdatedAt,
    );
    if (changed && !force) {
      return conflict(
        db,
        trainerId,
        q,
        "Booking",
        op.payload.bookingId,
        "같은 예약이 다른 곳에서 바뀌어 서버 기록을 유지했습니다",
        booking && {
          status: booking.status,
          startAt: booking.startAt,
          endAt: booking.endAt,
        },
      );
    }
    if (op.kind === "CANCEL_BOOKING")
      await cancelByTrainer(
        db,
        {
          trainerId,
          bookingId: op.payload.bookingId,
          reason: op.payload.reason,
        },
        now,
      );
    if (op.kind === "NO_SHOW")
      await markNoShow(db, { trainerId, bookingId: op.payload.bookingId }, now);
    if (op.kind === "RESCHEDULE") {
      const start = new Date(op.payload.startAt);
      const end = new Date(op.payload.endAt);
      if (booking?.status === "PENDING_CONFIRM")
        await reschedulePendingByTrainer(
          db,
          { trainerId, bookingId: op.payload.bookingId, start, end },
          now,
        );
      else
        await requestTimeChange(
          db,
          {
            actorUserId: trainerId,
            role: "TRAINER",
            bookingId: op.payload.bookingId,
            slots: [{ start, end }],
          },
          now,
        );
    }
    await db.booking.updateMany({
      where: { id: op.payload.bookingId },
      data: { offlineOrigin: origin },
    });
    return { id: q.id, status: "APPLIED" };
  } catch (e) {
    if (e instanceof AppError) {
      // 시간 겹침은 서버에 먼저 들어온 예약 우선, 나중 것은 충돌 목록으로
      if (
        e.code === "OVERLAP" ||
        e.code === "CONFLICT" ||
        e.code === "INVALID_TRANSITION"
      ) {
        return conflict(
          db,
          trainerId,
          q,
          "Booking",
          "bookingId" in op.payload
            ? (op.payload as { bookingId: string }).bookingId
            : null,
          `${KIND_LABEL[op.kind]}: ${e.message}`,
          null,
        );
      }
      return {
        id: q.id,
        status: "FAILED",
        reason: `${KIND_LABEL[op.kind]}: ${e.message}`,
      };
    }
    throw e;
  }
}

/** 복구 후 동기화 (11.3): 임시 변경을 만든 순서대로 서버에 반영 */
export async function syncOfflineOps(
  db: RootDb,
  trainerId: string,
  ops: QueuedOp[],
  now = new Date(),
) {
  const sorted = [...ops]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(0, 200);
  const results: OpResult[] = [];
  for (const q of sorted) results.push(await applyOne(db, trainerId, q, now));
  return results;
}

/** 동기화 충돌 목록 */
export async function listConflicts(db: Db, trainerId: string) {
  const rows = await db.syncConflict.findMany({
    where: { trainerId, resolvedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    kind: c.kind,
    label: KIND_LABEL[c.kind as OfflineOp["kind"]] ?? c.kind,
    reason: c.reason,
    localChange: c.localChange,
    serverState: c.serverState,
    deviceLabel: c.deviceLabel,
    localAt: c.localAt.toISOString(),
  }));
}

/** 충돌 해결: 서버 기록 유지 또는 휴대폰 변경 적용 */
export async function resolveConflict(
  db: RootDb,
  trainerId: string,
  conflictId: string,
  choice: "KEEP_SERVER" | "APPLY_LOCAL",
  now = new Date(),
) {
  const c = await db.syncConflict.findFirst({
    where: { id: conflictId, trainerId, resolvedAt: null },
  });
  if (!c) throw new AppError("NOT_FOUND", "충돌을 찾을 수 없습니다", 404);
  let result: OpResult | null = null;
  if (choice === "APPLY_LOCAL") {
    result = await applyOne(
      db,
      trainerId,
      {
        id: c.id,
        createdAt: c.localAt.toISOString(),
        device: c.deviceLabel,
        op: { kind: c.kind, payload: c.localChange } as OfflineOp,
      },
      now,
      true,
    );
    if (result.status !== "APPLIED") {
      await db.syncConflict.update({
        where: { id: c.id },
        data: { resolvedAt: now, resolution: "KEEP_SERVER" },
      });
      if (result.status === "CONFLICT")
        await db.syncConflict.update({
          where: { id: result.conflictId },
          data: { resolvedAt: now, resolution: "KEEP_SERVER" },
        });
      throw new AppError(
        "CANNOT_APPLY",
        `휴대폰 변경을 적용할 수 없어 서버 기록을 유지했습니다 (${"reason" in result ? result.reason : ""})`,
      );
    }
  }
  await db.syncConflict.update({
    where: { id: c.id },
    data: { resolvedAt: now, resolution: choice },
  });
  return result;
}
