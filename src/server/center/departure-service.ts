import { writeAuditLog } from "@/lib/audit";
import {
  departureDeadline,
  departureDefault,
  departureOptions,
} from "@/lib/center/scope";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { SYSTEM, transition } from "@/server/bookings/core";
import { queueNotification } from "@/server/notify/notify-service";
import { getStudentOfUser } from "@/server/students/access";
import {
  activeMembership,
  finishDissolve,
  requireCenterAdmin,
} from "./center-service";

const LABEL = {
  FOLLOW: "트레이너 따라가기",
  STAY: "센터에 남기",
  CENTER_ASSIGN: "센터가 정한 새 트레이너",
  FIND_OWN: "직접 다른 트레이너 찾기",
} as const;

/**
 * 트레이너의 센터 이동(7.3)·탈퇴(7.4) 시작: 담당 수강생 전원에게 선택 요청.
 * 이동은 7일, 탈퇴는 5일 뒤 적용. 그 전 예약은 그대로 진행.
 */
export async function startDeparture(
  db: Db,
  input: {
    trainerId: string;
    type: "MOVE" | "WITHDRAW";
    targetCenterId?: string | null;
    createdBy: string;
  },
  now = new Date(),
) {
  if (
    await db.trainerDeparture.findFirst({
      where: { trainerId: input.trainerId, appliedAt: null },
    })
  ) {
    throw new AppError("PENDING_EXISTS", "진행 중인 이동·탈퇴가 있습니다");
  }
  const membership = await activeMembership(db, input.trainerId);
  if (input.type === "MOVE" && !membership)
    throw new AppError("INVALID", "소속된 센터가 없습니다");
  const d = await db.trainerDeparture.create({
    data: {
      trainerId: input.trainerId,
      type: input.type,
      fromCenterId: membership?.centerId ?? null,
      targetCenterId: input.targetCenterId ?? null,
      deadlineAt: departureDeadline(input.type, now),
      createdBy: input.createdBy,
      createdAt: now,
    },
  });
  const links = await db.trainerStudentLink.findMany({
    where: { trainerId: input.trainerId, endedAt: null },
    include: { student: true },
  });
  const trainer = await db.user.findUniqueOrThrow({
    where: { id: input.trainerId },
  });
  for (const l of links) {
    await db.departureChoice.create({
      data: { departureId: d.id, studentId: l.studentId },
    });
    const opts = departureOptions(input.type, !!membership);
    await queueNotification(
      db,
      {
        userId: l.student.userId,
        studentId: l.studentId,
        type: "DEPARTURE_CHOICE",
        title: input.type === "MOVE" ? "트레이너 센터 이동" : "트레이너 탈퇴",
        body: `${trainer.name} 트레이너가 ${input.type === "MOVE" ? "센터를 옮깁니다" : "탈퇴합니다"}. ${opts.map((o) => LABEL[o]).join(" / ")} 중에서 골라 주세요.`,
        url: "/s/requests",
        responseRequired: true,
      },
      now,
    );
  }
  await writeAuditLog(db, {
    actor: { type: "USER", id: input.createdBy },
    entity: "TrainerDeparture",
    entityId: d.id,
    action: "departure.start",
    after: { type: input.type, students: links.length },
    at: now,
  });
  return d;
}

/** 트레이너: 센터 이동 신청 (지금 센터를 떠남, 옮길 센터는 따로 소속 요청) */
export async function requestMove(
  db: RootDb,
  trainerId: string,
  targetCenterId: string | null,
  now = new Date(),
) {
  return db.$transaction((tx) =>
    startDeparture(
      tx,
      { trainerId, type: "MOVE", targetCenterId, createdBy: trainerId },
      now,
    ),
  );
}

/** 센터 관리자: 트레이너 소속 해제 */
export async function releaseTrainer(
  db: RootDb,
  adminId: string,
  trainerId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const { members } = await requireCenterAdmin(tx, adminId);
    if (!members.includes(trainerId))
      throw new AppError("NOT_FOUND", "소속 트레이너가 아닙니다", 404);
    return startDeparture(
      tx,
      { trainerId, type: "MOVE", createdBy: adminId },
      now,
    );
  });
}

/** 수강생 선택 */
export async function chooseDeparture(
  db: RootDb,
  input: {
    userId: string | null;
    choiceId: string;
    choice: "FOLLOW" | "STAY" | "CENTER_ASSIGN" | "FIND_OWN";
  },
  now = new Date(),
) {
  const c = await db.departureChoice.findUnique({
    where: { id: input.choiceId },
    include: { departure: true },
  });
  if (!c || c.departure.appliedAt)
    throw new AppError("NOT_FOUND", "선택할 수 없습니다", 404);
  if (
    input.userId &&
    (await getStudentOfUser(db, input.userId)).id !== c.studentId
  )
    throw new AppError("NOT_FOUND", "선택할 수 없습니다", 404);
  if (
    !departureOptions(c.departure.type, !!c.departure.fromCenterId).includes(
      input.choice,
    )
  ) {
    throw new AppError("INVALID", "고를 수 없는 선택입니다");
  }
  await db.departureChoice.update({
    where: { id: c.id },
    data: { choice: input.choice, chosenAt: now, defaulted: false },
  });
}

/** 기한이 지난 이동·탈퇴 적용: 무응답은 기본값 */
async function applyDeparture(tx: Db, departureId: string, now: Date) {
  const d = await tx.trainerDeparture.findUniqueOrThrow({
    where: { id: departureId },
    include: { choices: true },
  });
  const inCenter = !!d.fromCenterId;
  for (const c of d.choices) {
    const choice = c.choice ?? departureDefault(d.type, inCenter);
    if (!c.choice)
      await tx.departureChoice.update({
        where: { id: c.id },
        data: { choice, defaulted: true },
      });
    if (choice === "FOLLOW") continue;
    // 남기·센터 지정·직접 찾기: 담당 트레이너 없음 (이용권·이력 유지). 센터가 새 트레이너를 정하면 인계로 이어짐
    await tx.trainerStudentLink.updateMany({
      where: { trainerId: d.trainerId, studentId: c.studentId, endedAt: null },
      data: {
        endedAt: now,
        status: "ENDED",
        endReason: d.type === "MOVE" ? "TRAINER_MOVED" : "TRAINER_WITHDRAWN",
      },
    });
    await tx.student.updateMany({
      where: { id: c.studentId, currentTrainerId: d.trainerId },
      data: { currentTrainerId: null },
    });
    const future = await tx.booking.findMany({
      where: {
        studentId: c.studentId,
        trainerId: d.trainerId,
        status: {
          in: ["REQUESTED", "PENDING_CONFIRM", "CONFIRMED", "INSUFFICIENT"],
        },
        startAt: { gt: now },
      },
    });
    for (const b of future) {
      await transition(tx, b, "CANCELED", {
        by: SYSTEM,
        reason: d.type === "MOVE" ? "트레이너 센터 이동" : "트레이너 탈퇴",
        now,
        data: {
          canceledAt: now,
          canceledBy: SYSTEM,
          cancelReason: d.type === "MOVE" ? "트레이너 이동" : "트레이너 탈퇴",
        },
      });
    }
  }
  if (d.type === "MOVE" && d.fromCenterId) {
    await tx.centerMembership.updateMany({
      where: {
        trainerId: d.trainerId,
        centerId: d.fromCenterId,
        status: "ACTIVE",
      },
      data: { status: "LEFT", leftAt: now },
    });
    if (d.targetCenterId) {
      await tx.centerMembership.create({
        data: {
          centerId: d.targetCenterId,
          trainerId: d.trainerId,
          createdAt: now,
        },
      });
    }
  }
  await tx.trainerDeparture.update({
    where: { id: d.id },
    data: { appliedAt: now },
  });
  await writeAuditLog(tx, {
    actor: { type: "SYSTEM" },
    entity: "TrainerDeparture",
    entityId: d.id,
    action: "departure.apply",
    at: now,
  });
}

/** 센터·인계 관련 자동 처리 (1분 작업) */
export async function runCenterJobs(db: RootDb, now = new Date()) {
  const due = await db.trainerDeparture.findMany({
    where: { appliedAt: null, deadlineAt: { lte: now } },
  });
  for (const d of due)
    await db.$transaction((tx) => applyDeparture(tx, d.id, now));
  const dissolving = await db.center.findMany({
    where: { status: "DISSOLVING", dissolveAt: { lte: now } },
  });
  for (const c of dissolving)
    await db.$transaction((tx) => finishDissolve(tx, c.id, now));
  return { departuresApplied: due.length, centersDissolved: dissolving.length };
}

/** 수강생 요청함: 고를 수 있는 이동·탈퇴 선택 */
export async function pendingDepartureChoices(db: Db, userId: string) {
  const s = await db.student.findUnique({ where: { userId } });
  if (!s) return [];
  const rows = await db.departureChoice.findMany({
    where: { studentId: s.id, departure: { appliedAt: null } },
    include: { departure: true },
  });
  const out = [];
  for (const c of rows) {
    const t = await db.user.findUniqueOrThrow({
      where: { id: c.departure.trainerId },
      select: { name: true },
    });
    out.push({
      id: c.id,
      trainerName: t.name,
      type: c.departure.type,
      deadlineAt: c.departure.deadlineAt.toISOString(),
      choice: c.choice,
      options: departureOptions(
        c.departure.type,
        !!c.departure.fromCenterId,
      ).map((o) => ({ value: o, label: LABEL[o] })),
      defaultChoice: departureDefault(
        c.departure.type,
        !!c.departure.fromCenterId,
      ),
    });
  }
  return out;
}

/** 센터: 이동 진행 상황 (따라감 / 남음 / 미응답) */
export async function departureProgress(db: Db, centerId: string) {
  const rows = await db.trainerDeparture.findMany({
    where: { fromCenterId: centerId },
    include: { choices: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const names = new Map(
    (
      await db.user.findMany({
        where: { id: { in: rows.map((r) => r.trainerId) } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  return rows.map((d) => ({
    id: d.id,
    trainerName: names.get(d.trainerId) ?? "",
    type: d.type,
    deadlineAt: d.deadlineAt.toISOString(),
    applied: !!d.appliedAt,
    follow: d.choices.filter((c) => c.choice === "FOLLOW").length,
    stay: d.choices.filter(
      (c) => c.choice === "STAY" || c.choice === "CENTER_ASSIGN",
    ).length,
    findOwn: d.choices.filter((c) => c.choice === "FIND_OWN").length,
    pending: d.choices.filter((c) => !c.choice).length,
  }));
}
