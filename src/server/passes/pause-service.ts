import { writeAuditLog } from "@/lib/audit";
import {
  checkPauseRequest,
  earlyResume,
  extendedEndDate,
  isPausedToday,
} from "@/lib/rules/pause";
import { pickRuleValues } from "@/lib/rules/rule-set";
import { parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { SYSTEM, transition } from "@/server/bookings/core";
import { reconcileInsufficient } from "@/server/bookings/insufficient";
import { queueNotification } from "@/server/notify/notify-service";
import { effectiveRules } from "@/server/rules/rule-service";
import {
  assertTrainerStudent,
  getStudentOfUser,
} from "@/server/students/access";

type Actor =
  { role: "TRAINER"; userId: string } | { role: "STUDENT"; userId: string };

/** 이 이용권을 다룰 수 있는지 (트레이너: 담당 수강생, 수강생: 본인) */
async function loadPassFor(db: Db, actor: Actor, passId: string) {
  const pass = await db.pass.findUnique({
    where: { id: passId },
    include: { student: true },
  });
  if (!pass) throw new AppError("NOT_FOUND", "이용권을 찾을 수 없습니다", 404);
  if (actor.role === "TRAINER")
    await assertTrainerStudent(db, actor.userId, pass.studentId);
  else if ((await getStudentOfUser(db, actor.userId)).id !== pass.studentId) {
    throw new AppError("NOT_FOUND", "이용권을 찾을 수 없습니다", 404);
  }
  return pass;
}

async function limitsOf(
  db: Db,
  pass: { ruleSetVersionId: string; agreedRuleSetId: string | null },
) {
  const rs = await db.ruleSet.findUniqueOrThrow({
    where: { id: effectiveRules(pass).ruleSetId },
  });
  return pickRuleValues(rs);
}

async function notifyOther(
  db: Db,
  pass: {
    soldByTrainerId: string;
    student: { id: string; userId: string | null };
  },
  toRole: "TRAINER" | "STUDENT",
  currentTrainerId: string | null,
  title: string,
  body: string,
  now: Date,
) {
  if (toRole === "TRAINER") {
    await queueNotification(
      db,
      {
        userId: currentTrainerId ?? pass.soldByTrainerId,
        type: "PAUSE",
        title,
        body,
        url: "/t/requests",
      },
      now,
    );
  } else {
    await queueNotification(
      db,
      {
        userId: pass.student.userId,
        studentId: pass.student.id,
        type: "PAUSE",
        title,
        body,
        url: "/s/passes",
      },
      now,
    );
  }
}

/** 일시정지 요청 (트레이너가 설정하거나 수강생이 요청 → 상대방 승인 시 적용, 3.3) */
export async function requestPause(
  db: RootDb,
  input: {
    actor: Actor;
    passId: string;
    startDate: string;
    endDate: string;
    reason: string;
  },
  now = new Date(),
) {
  const reason = input.reason.trim();
  if (!reason) throw new AppError("INVALID", "사유를 입력해 주세요");
  return db.$transaction(async (tx) => {
    const pass = await loadPassFor(tx, input.actor, input.passId);
    if (pass.status !== "ACTIVE" && pass.status !== "PAUSED")
      throw new AppError("INVALID", "사용 중인 이용권만 정지할 수 있습니다");
    const pending = await tx.passPause.count({
      where: { passId: pass.id, status: "PENDING" },
    });
    if (pending > 0)
      throw new AppError(
        "PENDING_EXISTS",
        "대기 중인 일시정지 요청이 있습니다",
      );
    const used = await tx.passPause.count({
      where: { passId: pass.id, status: { in: ["APPROVED", "ENDED_EARLY"] } },
    });
    const check = checkPauseRequest({
      startDate: input.startDate,
      endDate: input.endDate,
      today: toKstDateKey(now),
      passStartDate: toKstDateKey(pass.startDate),
      passEndDate: toKstDateKey(pass.endDate),
      usedCount: used,
      limits: await limitsOf(tx, pass),
    });
    if (!check.ok) throw new AppError("INVALID", check.message);
    const p = await tx.passPause.create({
      data: {
        passId: pass.id,
        requestedBy: input.actor.userId,
        requestedRole: input.actor.role,
        startDate: parseKstDateKey(input.startDate),
        endDate: parseKstDateKey(input.endDate),
        reason: reason.slice(0, 200),
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: input.actor.userId },
      entity: "PassPause",
      entityId: p.id,
      action: "pause.request",
      after: {
        passId: pass.id,
        startDate: input.startDate,
        endDate: input.endDate,
        reason,
      },
      at: now,
    });
    await notifyOther(
      tx,
      pass,
      input.actor.role === "TRAINER" ? "STUDENT" : "TRAINER",
      pass.student.currentTrainerId,
      "일시정지 요청",
      `${pass.name} ${input.startDate}~${input.endDate} 일시정지 요청이 왔습니다 (${reason}).`,
      now,
    );
    return p;
  });
}

/**
 * 일시정지 승인·거절. 요청한 쪽의 상대방만 응답할 수 있다.
 * 승인하면: 정지한 일수만큼 만료일 연장, 기간 안 예약은 차감 없이 취소, 시작·종료 하루 전 양쪽 알림.
 */
export async function respondPause(
  db: RootDb,
  input: { actor: Actor; pauseId: string; approve: boolean },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const pause = await tx.passPause.findUnique({
      where: { id: input.pauseId },
    });
    if (!pause || pause.status !== "PENDING")
      throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    const pass = await loadPassFor(tx, input.actor, pause.passId);
    if (pause.requestedRole === input.actor.role)
      throw new AppError("FORBIDDEN", "상대방이 승인해야 합니다", 403);
    if (!input.approve) {
      await tx.passPause.update({
        where: { id: pause.id },
        data: { status: "REJECTED", respondedAt: now },
      });
      await notifyOther(
        tx,
        pass,
        pause.requestedRole as "TRAINER" | "STUDENT",
        pass.student.currentTrainerId,
        "일시정지 거절",
        `${pass.name} 일시정지 요청이 거절되었습니다.`,
        now,
      );
      return;
    }
    const start = toKstDateKey(pause.startDate);
    const end = toKstDateKey(pause.endDate);
    // 승인 시점에 한도를 다시 확인 (요청 뒤 다른 정지가 승인됐을 수 있음)
    const used = await tx.passPause.count({
      where: { passId: pass.id, status: { in: ["APPROVED", "ENDED_EARLY"] } },
    });
    const check = checkPauseRequest({
      startDate: start,
      endDate: end,
      today: toKstDateKey(now) > start ? start : toKstDateKey(now),
      passStartDate: toKstDateKey(pass.startDate),
      passEndDate: toKstDateKey(pass.endDate),
      usedCount: used,
      limits: await limitsOf(tx, pass),
    });
    if (!check.ok) throw new AppError("INVALID", check.message);
    const newEnd = extendedEndDate(toKstDateKey(pass.endDate), start, end);
    await tx.passPause.update({
      where: { id: pause.id },
      data: {
        status: "APPROVED",
        approvedBy: input.actor.userId,
        respondedAt: now,
      },
    });
    await tx.pass.update({
      where: { id: pass.id },
      data: {
        endDate: parseKstDateKey(newEnd),
        status: isPausedToday(toKstDateKey(now), start, end)
          ? "PAUSED"
          : pass.status === "PAUSED"
            ? "ACTIVE"
            : pass.status,
      },
    });
    await tx.passChangeLog.create({
      data: {
        passId: pass.id,
        field: "endDate",
        before: toKstDateKey(pass.endDate),
        after: newEnd,
        changedBy: input.actor.userId,
        changedAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: input.actor.userId },
      entity: "PassPause",
      entityId: pause.id,
      action: "pause.approve",
      before: { passEndDate: toKstDateKey(pass.endDate) },
      after: { passEndDate: newEnd, days: check.days },
      at: now,
    });
    // 기간 안의 예정 예약은 차감 없이 취소
    const inPeriod = await tx.booking.findMany({
      where: {
        studentId: pass.studentId,
        status: {
          in: ["REQUESTED", "PENDING_CONFIRM", "CONFIRMED", "INSUFFICIENT"],
        },
        startAt: {
          gte: parseKstDateKey(start),
          lt: new Date(parseKstDateKey(end).getTime() + 86400_000),
        },
      },
    });
    for (const b of inPeriod) {
      await transition(tx, b, "CANCELED", {
        by: SYSTEM,
        reason: "일시정지로 취소",
        now,
        data: { canceledAt: now, canceledBy: SYSTEM, cancelReason: "일시정지" },
      });
    }
    await reconcileInsufficient(tx, pass.studentId, now);
    // 결과 알림 + 시작·종료 하루 전 양쪽에 알림
    const trainerId = pass.student.currentTrainerId ?? pass.soldByTrainerId;
    const text = `${pass.name} ${start}~${end} 일시정지가 승인되었습니다. 만료일이 ${newEnd}로 연장되었습니다.`;
    await notifyOther(
      tx,
      pass,
      pause.requestedRole as "TRAINER" | "STUDENT",
      pass.student.currentTrainerId,
      "일시정지 승인",
      text,
      now,
    );
    for (const [when, label] of [
      [
        new Date(parseKstDateKey(start).getTime() - 86400_000 + 10 * 3600_000),
        `내일부터 ${pass.name} 일시정지가 시작됩니다 (${start}~${end}).`,
      ],
      [
        new Date(parseKstDateKey(end).getTime() + 10 * 3600_000),
        `내일부터 ${pass.name} 일시정지가 끝나고 수업을 다시 예약할 수 있습니다.`,
      ],
    ] as const) {
      if (when <= now) continue;
      await queueNotification(
        tx,
        {
          userId: pass.student.userId,
          studentId: pass.studentId,
          type: "PAUSE_NOTICE",
          title: "일시정지 안내",
          body: label,
          url: "/s/passes",
          scheduledAt: when,
          dedupeKey: `${pause.id}:${when.toISOString()}:S`,
        },
        now,
      );
      await queueNotification(
        tx,
        {
          userId: trainerId,
          type: "PAUSE_NOTICE",
          title: "일시정지 안내",
          body: `${pass.student.name}님: ${label}`,
          url: `/t/students/${pass.studentId}/passes`,
          scheduledAt: when,
          dedupeKey: `${pause.id}:${when.toISOString()}:T`,
        },
        now,
      );
    }
  });
}

/** 신청한 쪽의 취소 (승인 전) */
export async function cancelPauseRequest(
  db: RootDb,
  input: { actor: Actor; pauseId: string },
  now = new Date(),
) {
  const pause = await db.passPause.findUnique({ where: { id: input.pauseId } });
  if (
    !pause ||
    pause.status !== "PENDING" ||
    pause.requestedBy !== input.actor.userId
  ) {
    throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
  }
  await db.passPause.update({
    where: { id: pause.id },
    data: { status: "CANCELED", respondedAt: now },
  });
}

/** 조기 재개: 실제로 쉰 일수만 연장 (트레이너·수강생 모두) */
export async function resumeEarly(
  db: RootDb,
  input: { actor: Actor; pauseId: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const pause = await tx.passPause.findUnique({
      where: { id: input.pauseId },
    });
    if (!pause || pause.status !== "APPROVED")
      throw new AppError("NOT_FOUND", "정지 중인 기간이 없습니다", 404);
    const pass = await loadPassFor(tx, input.actor, pause.passId);
    const today = toKstDateKey(now);
    const plannedEnd = toKstDateKey(pause.endDate);
    if (today > plannedEnd)
      throw new AppError("INVALID", "이미 끝난 일시정지입니다");
    const r = earlyResume({
      pauseStart: toKstDateKey(pause.startDate),
      plannedEnd,
      resumeDate: today,
      currentPassEndDate: toKstDateKey(pass.endDate),
    });
    await tx.passPause.update({
      where: { id: pause.id },
      data: {
        status: "ENDED_EARLY",
        actualEndDate: r.actualEnd ? parseKstDateKey(r.actualEnd) : null,
      },
    });
    await tx.pass.update({
      where: { id: pass.id },
      data: {
        endDate: parseKstDateKey(r.newPassEndDate),
        status: pass.status === "PAUSED" ? "ACTIVE" : pass.status,
      },
    });
    await tx.passChangeLog.create({
      data: {
        passId: pass.id,
        field: "endDate",
        before: toKstDateKey(pass.endDate),
        after: r.newPassEndDate,
        changedBy: input.actor.userId,
        changedAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: input.actor.userId },
      entity: "PassPause",
      entityId: pause.id,
      action: "pause.resumeEarly",
      after: { restedDays: r.restedDays, passEndDate: r.newPassEndDate },
      at: now,
    });
    await tx.notification.updateMany({
      where: {
        type: "PAUSE_NOTICE",
        status: "SCHEDULED",
        dedupeKey: { startsWith: `${pause.id}:` },
      },
      data: { status: "CANCELED", failReason: "RESUMED" },
    });
    await notifyOther(
      tx,
      pass,
      input.actor.role === "TRAINER" ? "STUDENT" : "TRAINER",
      pass.student.currentTrainerId,
      "일시정지 조기 재개",
      `${pass.name} 일시정지를 일찍 끝냈습니다. 실제로 쉰 ${r.restedDays}일만큼 연장되어 만료일은 ${r.newPassEndDate}입니다.`,
      now,
    );
    return r;
  });
}

/** 매일: 정지 기간이 시작·끝난 이용권 상태 바꾸기 (사용 중 ↔ 일시정지) */
export async function syncPauseStatuses(db: RootDb, now = new Date()) {
  const today = toKstDateKey(now);
  const pauses = await db.passPause.findMany({
    where: { status: "APPROVED" },
    include: { pass: true },
  });
  let changed = 0;
  for (const p of pauses) {
    const active = isPausedToday(
      today,
      toKstDateKey(p.startDate),
      toKstDateKey(p.endDate),
    );
    if (active && p.pass.status === "ACTIVE") {
      await db.pass.update({
        where: { id: p.passId },
        data: { status: "PAUSED" },
      });
      changed += 1;
    } else if (
      !active &&
      p.pass.status === "PAUSED" &&
      today > toKstDateKey(p.endDate)
    ) {
      await db.pass.update({
        where: { id: p.passId },
        data: { status: "ACTIVE" },
      });
      changed += 1;
    }
  }
  return { pauseStatusChanged: changed };
}

/** 화면용 정지 목록 */
export async function listPauses(db: Db, passIds: string[]) {
  const rows = await db.passPause.findMany({
    where: { passId: { in: passIds } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((p) => ({
    id: p.id,
    passId: p.passId,
    requestedRole: p.requestedRole,
    startDate: toKstDateKey(p.startDate),
    endDate: toKstDateKey(p.endDate),
    actualEndDate: p.actualEndDate ? toKstDateKey(p.actualEndDate) : null,
    reason: p.reason,
    status: p.status,
  }));
}

/** 요청함: 내가 응답해야 하는 일시정지 요청 */
export async function pendingPausesFor(
  db: Db,
  userId: string,
  role: "TRAINER" | "STUDENT",
) {
  const rows = await db.passPause.findMany({
    where: {
      status: "PENDING",
      requestedRole: role === "TRAINER" ? "STUDENT" : "TRAINER",
      pass:
        role === "TRAINER"
          ? {
              student: {
                trainerLinks: { some: { trainerId: userId, endedAt: null } },
              },
            }
          : { student: { userId } },
    },
    include: { pass: { include: { student: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    passName: p.pass.name,
    studentName: p.pass.student.name,
    startDate: toKstDateKey(p.startDate),
    endDate: toKstDateKey(p.endDate),
    reason: p.reason,
  }));
}

/** 캘린더 빗금: 승인된 정지 기간 */
export async function pauseRangesFor(db: Db, where: { studentIds: string[] }) {
  const rows = await db.passPause.findMany({
    where: {
      status: { in: ["APPROVED", "ENDED_EARLY"] },
      pass: { studentId: { in: where.studentIds } },
    },
    include: { pass: { include: { student: { select: { name: true } } } } },
  });
  return rows
    .filter((p) => p.status === "APPROVED" || p.actualEndDate)
    .map((p) => ({
      studentId: p.pass.studentId,
      studentName: p.pass.student.name,
      startDate: toKstDateKey(p.startDate),
      endDate: toKstDateKey(
        p.status === "ENDED_EARLY" ? p.actualEndDate! : p.endDate,
      ),
    }));
}
