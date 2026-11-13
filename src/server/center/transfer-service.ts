import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canCenterApprovePassTransfer } from "@/lib/center/scope";
import { toKstDateKey } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { SYSTEM, assertNoOverlap, transition } from "@/server/bookings/core";
import { reconcileInsufficient } from "@/server/bookings/insufficient";
import { queueNotification } from "@/server/notify/notify-service";
import {
  getTrainerDefaultRuleSet,
  requestRuleConsent,
} from "@/server/rules/rule-service";
import { getStudentOfUser } from "@/server/students/access";
import { requireCenterAdmin } from "./center-service";

const DAY = 86400_000;
type TransferRow = Prisma.TransferRequestGetPayload<object>;

const FUTURE = [
  "REQUESTED",
  "PENDING_CONFIRM",
  "CONFIRMED",
  "INSUFFICIENT",
] as const;

async function hasRemainingPasses(db: Db, studentId: string, now: Date) {
  const passes = await db.pass.findMany({
    where: { studentId, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  return passes.some((p) => toKstDateKey(p.endDate) >= toKstDateKey(now));
}

async function notify(
  db: Db,
  userId: string | null,
  title: string,
  body: string,
  url: string,
  now: Date,
  studentId?: string,
  responseRequired = false,
) {
  await queueNotification(
    db,
    {
      userId,
      studentId: studentId ?? null,
      type: "TRANSFER",
      title,
      body,
      url,
      responseRequired,
    },
    now,
  );
}

/**
 * 담당 트레이너 변경 시작 (7.2).
 * - 수강생: 새 트레이너 선택 → 새 트레이너 수락 → 완료
 * - 이전 트레이너(인계): 새 트레이너 선택 → 새 트레이너 수락 → 수강생 동의 → 완료
 * - 센터 관리자: 담당 변경 → 새 트레이너 수락 → 수강생 동의 → 완료
 * 남은 이용권은 이전 트레이너의 "넘기기" 동의(같은 센터면 센터 관리자 승인도 가능)가 있어야 넘어간다.
 */
export async function startTransfer(
  db: RootDb,
  input: {
    initiator: "STUDENT" | "TRAINER" | "CENTER_ADMIN";
    actorUserId: string;
    studentId?: string;
    toTrainerId: string;
    /** 이전 트레이너가 시작할 때: 이용권 넘기기 동의 */
    passAgree?: boolean;
    memoTransfer?: boolean;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    let studentId = input.studentId ?? null;
    if (input.initiator === "STUDENT")
      studentId = (await getStudentOfUser(tx, input.actorUserId)).id;
    if (!studentId) throw new AppError("INVALID", "수강생을 골라 주세요");
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
    });
    const from = student.currentTrainerId;
    if (input.initiator === "TRAINER" && from !== input.actorUserId)
      throw new AppError("NOT_FOUND", "수강생을 찾을 수 없습니다", 404);
    if (from === input.toTrainerId)
      throw new AppError("INVALID", "지금 담당 트레이너입니다");
    const to = await tx.user.findFirst({
      where: { id: input.toTrainerId, role: "TRAINER", status: "ACTIVE" },
    });
    if (!to)
      throw new AppError("NOT_FOUND", "트레이너를 찾을 수 없습니다", 404);
    if (
      await tx.transferRequest.count({
        where: {
          studentId,
          status: { in: ["PENDING_TRAINER", "PENDING_STUDENT"] },
        },
      })
    ) {
      throw new AppError("PENDING_EXISTS", "진행 중인 담당 변경이 있습니다");
    }

    let centerId: string | null = null;
    let passTransfer: TransferRow["passTransfer"] = "PENDING";
    if (!from || !(await hasRemainingPasses(tx, studentId, now)))
      passTransfer = "NOT_NEEDED";
    if (input.initiator === "TRAINER" && passTransfer === "PENDING")
      passTransfer = input.passAgree ? "AGREED" : "REFUSED";
    if (input.initiator === "CENTER_ADMIN") {
      const { center, members } = await requireCenterAdmin(
        tx,
        input.actorUserId,
      );
      centerId = center.id;
      if (!members.includes(input.toTrainerId))
        throw new AppError("INVALID", "센터 소속 트레이너만 고를 수 있습니다");
      if (from && !members.includes(from))
        throw new AppError("NOT_FOUND", "센터 수강생이 아닙니다", 404);
      if (!from) {
        // 담당 없는 수강생: 이 센터에서 남기·센터 지정을 고른 수강생만
        const choice = await tx.departureChoice.findFirst({
          where: {
            studentId,
            choice: { in: ["STAY", "CENTER_ASSIGN"] },
            departure: { fromCenterId: center.id, appliedAt: { not: null } },
          },
        });
        if (!choice)
          throw new AppError("NOT_FOUND", "센터 수강생이 아닙니다", 404);
      }
      if (passTransfer === "PENDING") {
        const ok = canCenterApprovePassTransfer({
          adminUserId: input.actorUserId,
          fromTrainerId: from,
          toTrainerId: input.toTrainerId,
          members,
        });
        if (ok.ok) passTransfer = "CENTER_APPROVED";
      }
    }

    const t = await tx.transferRequest.create({
      data: {
        studentId,
        fromTrainerId: from,
        toTrainerId: input.toTrainerId,
        initiatedBy: input.initiator,
        initiatedByUserId: input.actorUserId,
        centerId,
        passTransfer,
        passDecidedAt: passTransfer === "PENDING" ? null : now,
        passDecidedBy: passTransfer === "PENDING" ? null : input.actorUserId,
        memoTransfer:
          input.initiator === "TRAINER" ? !!input.memoTransfer : false,
        deadlineAt: new Date(now.getTime() + 7 * DAY),
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: input.actorUserId },
      entity: "TransferRequest",
      entityId: t.id,
      action: "transfer.start",
      after: {
        studentId,
        from,
        to: input.toTrainerId,
        initiator: input.initiator,
        passTransfer,
      },
      at: now,
    });
    await notify(
      tx,
      input.toTrainerId,
      "담당 요청",
      `${student.name}님의 담당 트레이너 요청이 왔습니다.`,
      "/t/requests",
      now,
    );
    if (from && input.initiator === "STUDENT" && passTransfer === "PENDING") {
      await notify(
        tx,
        from,
        "이용권 넘기기 확인",
        `${student.name}님이 트레이너 변경을 요청했습니다. 남은 이용권을 넘길지 정해 주세요.`,
        "/t/requests",
        now,
      );
    }
    return t;
  });
}

/** 새 트레이너: 수락(예정 예약별 유지·취소) / 거절 */
export async function respondTransferAsNewTrainer(
  db: RootDb,
  input: {
    trainerId: string;
    transferId: string;
    accept: boolean;
    bookingDecisions?: Record<string, "KEEP" | "CANCEL">;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const t = await tx.transferRequest.findFirst({
      where: {
        id: input.transferId,
        toTrainerId: input.trainerId,
        status: "PENDING_TRAINER",
      },
    });
    if (!t) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    if (!input.accept) {
      await tx.transferRequest.update({
        where: { id: t.id },
        data: { status: "REJECTED" },
      });
      await notifyAll(
        tx,
        t,
        "담당 변경 거절",
        "새 트레이너가 담당 요청을 거절했습니다.",
        now,
      );
      return;
    }
    const updated = await tx.transferRequest.update({
      where: { id: t.id },
      data: {
        toTrainerAcceptedAt: now,
        bookingDecisions: input.bookingDecisions ?? {},
        status: t.initiatedBy === "STUDENT" ? "COMPLETED" : "PENDING_STUDENT",
      },
    });
    if (t.initiatedBy === "STUDENT") {
      await completeTransfer(tx, updated, now);
    } else {
      const s = await tx.student.findUniqueOrThrow({
        where: { id: t.studentId },
      });
      await notify(
        tx,
        s.userId,
        "담당 트레이너 변경 동의",
        "담당 트레이너 변경에 동의해 주세요.",
        "/s/requests",
        now,
        s.id,
        true,
      );
    }
  });
}

/** 수강생: 인계·센터 담당 변경 동의 */
export async function respondTransferAsStudent(
  db: RootDb,
  input: { userId: string; transferId: string; agree: boolean },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const student = await getStudentOfUser(tx, input.userId);
    const t = await tx.transferRequest.findFirst({
      where: {
        id: input.transferId,
        studentId: student.id,
        status: "PENDING_STUDENT",
      },
    });
    if (!t) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    if (!input.agree) {
      await tx.transferRequest.update({
        where: { id: t.id },
        data: { status: "REJECTED" },
      });
      await notifyAll(
        tx,
        t,
        "담당 변경 거절",
        "수강생이 담당 트레이너 변경에 동의하지 않았습니다.",
        now,
      );
      return;
    }
    const updated = await tx.transferRequest.update({
      where: { id: t.id },
      data: { studentAgreedAt: now, status: "COMPLETED" },
    });
    await completeTransfer(tx, updated, now);
  });
}

async function notifyAll(
  tx: Db,
  t: TransferRow,
  title: string,
  body: string,
  now: Date,
) {
  const s = await tx.student.findUniqueOrThrow({ where: { id: t.studentId } });
  for (const u of new Set(
    [t.fromTrainerId, t.toTrainerId, s.userId, t.initiatedByUserId].filter(
      Boolean,
    ) as string[],
  )) {
    await notify(tx, u, title, `${s.name}: ${body}`, "/", now);
  }
}

/** 넘어간 이용권: 새 트레이너 규칙 적용 + 다시 동의 요청 (동의 전까지 이전 규칙) */
async function adoptPasses(tx: Db, t: TransferRow, now: Date) {
  const rs = await getTrainerDefaultRuleSet(tx, t.toTrainerId);
  const passes = await tx.pass.findMany({
    where: {
      studentId: t.studentId,
      status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] },
    },
  });
  for (const p of passes) {
    if (toKstDateKey(p.endDate) < toKstDateKey(now)) continue;
    await tx.pass.update({
      where: { id: p.id },
      data: {
        status: p.status === "SUSPENDED" ? "ACTIVE" : p.status,
        ruleSetVersionId: rs.id,
      },
    });
    if (p.agreedRuleSetId !== rs.id)
      await requestRuleConsent(tx, p.id, t.toTrainerId, now);
  }
}

/** 담당 변경 완료: 계정·이용권·이력은 그대로, 담당 트레이너만 바뀐다 (7.1) */
async function completeTransfer(tx: Db, t: TransferRow, now: Date) {
  const student = await tx.student.findUniqueOrThrow({
    where: { id: t.studentId },
  });
  if (student.currentTrainerId !== t.fromTrainerId)
    throw new AppError("CONFLICT", "담당 트레이너가 이미 바뀌었습니다", 409);
  const oldLink = t.fromTrainerId
    ? await tx.trainerStudentLink.findFirst({
        where: {
          trainerId: t.fromTrainerId,
          studentId: t.studentId,
          endedAt: null,
        },
      })
    : null;
  if (oldLink) {
    await tx.trainerStudentLink.update({
      where: { id: oldLink.id },
      data: { endedAt: now, status: "ENDED", endReason: "TRANSFER" },
    });
  }
  await tx.trainerStudentLink.create({
    data: {
      trainerId: t.toTrainerId,
      studentId: t.studentId,
      startedAt: now,
      memo: t.memoTransfer && oldLink ? oldLink.memo : "",
      memoTransferred: t.memoTransfer && !!oldLink?.memo,
      notifyDayBefore: oldLink?.notifyDayBefore ?? true,
      notify2h: oldLink?.notify2h ?? true,
    },
  });
  await tx.student.update({
    where: { id: t.studentId },
    data: { currentTrainerId: t.toTrainerId },
  });

  // 예정 예약: 새 트레이너가 정한 대로 유지(진행 트레이너를 새 트레이너로) 또는 차감 없이 취소
  const decisions =
    (t.bookingDecisions as Record<string, "KEEP" | "CANCEL"> | null) ?? {};
  if (t.fromTrainerId) {
    const future = await tx.booking.findMany({
      where: {
        studentId: t.studentId,
        trainerId: t.fromTrainerId,
        status: { in: [...FUTURE] },
        startAt: { gt: now },
      },
    });
    for (const b of future) {
      let keep = decisions[b.id] === "KEEP";
      if (keep) {
        try {
          await assertNoOverlap(tx, {
            trainerId: t.toTrainerId,
            studentId: t.studentId,
            range: { start: b.startAt, end: b.endAt },
            excludeBookingId: b.id,
          });
        } catch {
          keep = false;
        }
      }
      if (keep) {
        await tx.booking.update({
          where: { id: b.id },
          data: { trainerId: t.toTrainerId },
        });
        await writeAuditLog(tx, {
          actor: { type: "SYSTEM" },
          entity: "Booking",
          entityId: b.id,
          action: "booking.reassign",
          before: { trainerId: t.fromTrainerId },
          after: { trainerId: t.toTrainerId },
          at: now,
        });
      } else {
        await transition(tx, b, "CANCELED", {
          by: SYSTEM,
          reason: "담당 트레이너 변경",
          now,
          data: {
            canceledAt: now,
            canceledBy: SYSTEM,
            cancelReason: "담당 트레이너 변경",
          },
        });
      }
    }
  }

  // 남은 이용권
  if (
    t.passTransfer === "AGREED" ||
    t.passTransfer === "CENTER_APPROVED" ||
    t.passTransfer === "NOT_NEEDED"
  ) {
    await adoptPasses(tx, t, now);
  } else {
    // 동의 전·거절: 이전 트레이너 쪽에 "사용 중지"로 남는다
    await tx.pass.updateMany({
      where: { studentId: t.studentId, status: { in: ["ACTIVE", "PAUSED"] } },
      data: { status: "SUSPENDED" },
    });
  }
  await reconcileInsufficient(tx, t.studentId, now);
  await writeAuditLog(tx, {
    actor: { type: "SYSTEM" },
    entity: "TransferRequest",
    entityId: t.id,
    action: "transfer.complete",
    after: { passTransfer: t.passTransfer },
    at: now,
  });
  await tx.transferRequest.update({
    where: { id: t.id },
    data: { completedAt: now, status: "COMPLETED" },
  });
  await notifyAll(
    tx,
    t,
    "담당 트레이너 변경 완료",
    "담당 트레이너가 바뀌었습니다.",
    now,
  );
}

/** 이전 트레이너: 남은 이용권 넘기기 동의·거절 */
export async function decidePassTransfer(
  db: RootDb,
  input: { trainerId: string; transferId: string; agree: boolean },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const t = await tx.transferRequest.findFirst({
      where: {
        id: input.transferId,
        fromTrainerId: input.trainerId,
        passTransfer: "PENDING",
      },
    });
    if (!t) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    await applyPassDecision(
      tx,
      t,
      input.agree ? "AGREED" : "REFUSED",
      input.trainerId,
      now,
    );
  });
}

/** 센터 관리자: 같은 센터 안 인계의 이용권 이동 승인 (본인 관련 건 제외) */
export async function centerApprovePassTransfer(
  db: RootDb,
  input: { adminId: string; transferId: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const { members } = await requireCenterAdmin(tx, input.adminId);
    const t = await tx.transferRequest.findFirst({
      where: { id: input.transferId, passTransfer: "PENDING" },
    });
    if (!t) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    const ok = canCenterApprovePassTransfer({
      adminUserId: input.adminId,
      fromTrainerId: t.fromTrainerId,
      toTrainerId: t.toTrainerId,
      members,
    });
    if (!ok.ok) {
      throw new AppError(
        "FORBIDDEN",
        ok.reason === "SELF_INVOLVED"
          ? "본인이 관련된 이용권 이동은 스스로 승인할 수 없습니다"
          : "같은 센터 안의 인계만 승인할 수 있습니다",
        403,
      );
    }
    await applyPassDecision(tx, t, "CENTER_APPROVED", input.adminId, now);
  });
}

async function applyPassDecision(
  tx: Db,
  t: TransferRow,
  decision: "AGREED" | "REFUSED" | "CENTER_APPROVED",
  by: string,
  now: Date,
) {
  await tx.transferRequest.update({
    where: { id: t.id },
    data: { passTransfer: decision, passDecidedAt: now, passDecidedBy: by },
  });
  await writeAuditLog(tx, {
    actor: { type: "USER", id: by },
    entity: "TransferRequest",
    entityId: t.id,
    action: `transfer.pass.${decision.toLowerCase()}`,
    at: now,
  });
  // 이미 담당이 바뀐 뒤 결정되면 그때 이용권을 넘긴다
  if (t.status === "COMPLETED" && decision !== "REFUSED")
    await adoptPasses(tx, { ...t, passTransfer: decision }, now);
  if (t.status === "COMPLETED")
    await reconcileInsufficient(tx, t.studentId, now);
  await notifyAll(
    tx,
    t,
    "이용권 넘기기",
    decision === "REFUSED"
      ? "남은 이용권은 넘어가지 않고 사용 중지로 남습니다."
      : "남은 이용권이 새 트레이너에게 넘어갔습니다.",
    now,
  );
}

/** 7일 무응답: 수강생·새 트레이너에게 알리고, 센터 소속이면 센터 관리자에게 넘김 */
export async function runTransferDeadlines(db: RootDb, now = new Date()) {
  const due = await db.transferRequest.findMany({
    where: {
      passTransfer: "PENDING",
      deadlineAt: { lte: now },
      status: { not: "REJECTED" },
    },
  });
  let n = 0;
  for (const t of due) {
    const key = `TRANSFER_PASS_OVERDUE:${t.id}`;
    if (await db.notification.findUnique({ where: { dedupeKey: key } }))
      continue;
    const s = await db.student.findUniqueOrThrow({
      where: { id: t.studentId },
    });
    await queueNotification(
      db,
      {
        userId: t.toTrainerId,
        type: "TRANSFER",
        title: "이용권 넘기기 무응답",
        body: `${s.name}님 이전 트레이너가 7일 동안 이용권 넘기기에 응답하지 않았습니다.`,
        url: "/t/requests",
        dedupeKey: key,
      },
      now,
    );
    await queueNotification(
      db,
      {
        userId: s.userId,
        studentId: s.id,
        type: "TRANSFER",
        title: "이용권 넘기기 무응답",
        body: "이전 트레이너가 이용권 넘기기에 응답하지 않았습니다.",
        url: "/s/passes",
        dedupeKey: `${key}:S`,
      },
      now,
    );
    const m = t.fromTrainerId
      ? await db.centerMembership.findFirst({
          where: { trainerId: t.fromTrainerId, status: "ACTIVE" },
        })
      : null;
    if (m) {
      for (const a of await db.centerAdmin.findMany({
        where: { centerId: m.centerId },
      })) {
        await queueNotification(
          db,
          {
            userId: a.userId,
            type: "TRANSFER",
            title: "이용권 이동 승인 요청",
            body: `${s.name}님의 남은 이용권 이동을 승인해 주세요.`,
            url: "/c/students",
            dedupeKey: `${key}:${a.userId}`,
          },
          now,
        );
      }
    }
    n += 1;
  }
  return { transferOverdue: n };
}

/** 요청함의 인계 항목 */
export async function transferInbox(
  db: Db,
  userId: string,
  role: "TRAINER" | "STUDENT",
) {
  const names = async (ids: (string | null)[]) =>
    new Map(
      (
        await db.user.findMany({
          where: { id: { in: ids.filter(Boolean) as string[] } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
  if (role === "TRAINER") {
    const [toMe, passes] = await Promise.all([
      db.transferRequest.findMany({
        where: { toTrainerId: userId, status: "PENDING_TRAINER" },
      }),
      db.transferRequest.findMany({
        where: {
          fromTrainerId: userId,
          passTransfer: "PENDING",
          status: { notIn: ["REJECTED", "CANCELED"] },
        },
      }),
    ]);
    const studentNames = new Map(
      (
        await db.student.findMany({
          where: { id: { in: [...toMe, ...passes].map((t) => t.studentId) } },
          select: { id: true, name: true },
        })
      ).map((s) => [s.id, s.name]),
    );
    const n = await names(
      [...toMe, ...passes].flatMap((t) => [t.fromTrainerId, t.toTrainerId]),
    );
    return {
      transferRequests: toMe.map((t) => ({
        id: t.id,
        studentName: studentNames.get(t.studentId) ?? "",
        fromTrainerName: t.fromTrainerId
          ? (n.get(t.fromTrainerId) ?? "")
          : null,
        initiatedBy: t.initiatedBy,
      })),
      passDecisions: passes.map((t) => ({
        id: t.id,
        studentName: studentNames.get(t.studentId) ?? "",
        toTrainerName: n.get(t.toTrainerId) ?? "",
      })),
      transferConsents: [],
    };
  }
  const s = await db.student.findUnique({ where: { userId } });
  if (!s)
    return { transferRequests: [], passDecisions: [], transferConsents: [] };
  const rows = await db.transferRequest.findMany({
    where: { studentId: s.id, status: "PENDING_STUDENT" },
  });
  const n = await names(rows.flatMap((t) => [t.fromTrainerId, t.toTrainerId]));
  return {
    transferRequests: [],
    passDecisions: [],
    transferConsents: rows.map((t) => ({
      id: t.id,
      fromTrainerName: t.fromTrainerId ? (n.get(t.fromTrainerId) ?? "") : null,
      toTrainerName: n.get(t.toTrainerId) ?? "",
      initiatedBy: t.initiatedBy,
    })),
  };
}
