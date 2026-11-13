import { writeAuditLog } from "@/lib/audit";
import {
  centerCanSee,
  centerCanSeeContact,
  centerCanSeeDate,
  visibleTrainers,
} from "@/lib/center/scope";
import { maskPhone } from "@/lib/phone";
import {
  computeTrainerStats,
  summarizeStats,
  type StatStudent,
} from "@/lib/stats/stats";
import { addKstDays, parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { requireCenterAdmin } from "./center-service";
import { departureProgress } from "./departure-service";

function period(from: string, to: string, maxDays = 400) {
  try {
    const start = parseKstDateKey(from);
    const end = addKstDays(parseKstDateKey(to), 1);
    if (end <= start || end.getTime() - start.getTime() > maxDays * 86400_000)
      throw new Error();
    return { start, end };
  } catch {
    throw new AppError("INVALID", "조회 기간을 확인해 주세요");
  }
}

/** 센터가 본 기록은 이력으로 남긴다 (9.3) */
async function logView(
  db: Db,
  adminId: string,
  centerId: string,
  what: string,
  detail?: unknown,
) {
  await writeAuditLog(db, {
    actor: { type: "USER", id: adminId },
    entity: "Center",
    entityId: centerId,
    action: `center.view.${what}`,
    after: detail,
  });
}

/** 센터 캘린더: 소속 트레이너 전체 일정 (소속 기간 안만) */
export async function getCenterCalendar(
  db: Db,
  adminId: string,
  from: string,
  to: string,
) {
  const { center, windows } = await requireCenterAdmin(db, adminId);
  const r = period(from, to, 62);
  const ids = visibleTrainers(windows);
  const rows = await db.booking.findMany({
    where: {
      trainerId: { in: ids },
      startAt: { gte: r.start, lt: r.end },
      status: { notIn: ["REJECTED", "EXPIRED"] },
    },
    include: {
      student: { select: { name: true } },
      trainer: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
  });
  await logView(db, adminId, center.id, "calendar", { from, to });
  const trainers = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return {
    trainers: trainers.map((t, i) => ({
      id: t.id,
      name: t.name,
      colorIndex: i % 8,
      current: windows.some((w) => w.trainerId === t.id && !w.leftAt),
    })),
    bookings: rows
      .filter((b) => centerCanSee(windows, b.trainerId, b.startAt))
      .map((b) => ({
        id: b.id,
        trainerId: b.trainerId,
        trainerName: b.trainer.name,
        studentName: b.student.name,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        status: b.status,
      })),
  };
}

/** 트레이너 관리: 소속·요청·이동 진행 상황 */
export async function getCenterTrainers(db: Db, adminId: string) {
  const { center } = await requireCenterAdmin(db, adminId);
  const ms = await db.centerMembership.findMany({
    where: { centerId: center.id },
    include: { trainer: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  const admins = await db.centerAdmin.findMany({
    where: { centerId: center.id },
    include: { user: { select: { name: true, role: true } } },
  });
  await logView(db, adminId, center.id, "trainers");
  return {
    center: {
      id: center.id,
      name: center.name,
      status: center.status,
      dissolveAt: center.dissolveAt?.toISOString() ?? null,
      verified: center.verified,
    },
    admins: admins.map((a) => ({
      userId: a.userId,
      name: a.user.name,
      isTrainer: a.user.role === "TRAINER",
      me: a.userId === adminId,
    })),
    members: ms.map((m) => ({
      membershipId: m.id,
      trainerId: m.trainerId,
      name: m.trainer.name,
      phoneMasked: maskPhone(m.trainer.phone),
      status: m.status,
      waitingConsent: m.status === "PENDING" && !!m.approvedAt,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      leftAt: m.leftAt?.toISOString() ?? null,
    })),
    departures: await departureProgress(db, center.id),
  };
}

/**
 * 수강생 관리: 센터 전체 수강생(담당 트레이너 표시) + 이 센터에 남은 "담당 없음" 수강생.
 * 연락처는 지금 담당이 센터 소속일 때만 (따라간 수강생은 가림).
 */
export async function getCenterStudents(db: Db, adminId: string) {
  const { center, windows, members } = await requireCenterAdmin(db, adminId);
  const assigned = await db.student.findMany({
    where: { currentTrainerId: { in: members } },
    include: {
      passes: { where: { status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] } } },
    },
    orderBy: { name: "asc" },
  });
  const unassigned = await db.student.findMany({
    where: {
      currentTrainerId: null,
      // 이 센터의 이동·탈퇴에서 "남기"·"센터 지정"을 고른 수강생
      id: {
        in: (
          await db.departureChoice.findMany({
            where: {
              choice: { in: ["STAY", "CENTER_ASSIGN"] },
              departure: { fromCenterId: center.id, appliedAt: { not: null } },
            },
            select: { studentId: true },
          })
        ).map((c) => c.studentId),
      },
    },
    include: {
      passes: { where: { status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] } } },
    },
  });
  const trainerNames = new Map(
    (
      await db.user.findMany({
        where: { id: { in: members } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  const transfers = await db.transferRequest.findMany({
    where: {
      studentId: { in: [...assigned, ...unassigned].map((s) => s.id) },
      OR: [
        { status: { in: ["PENDING_TRAINER", "PENDING_STUDENT"] } },
        { passTransfer: "PENDING" },
      ],
    },
  });
  await logView(db, adminId, center.id, "students");
  return {
    members: members.map((id) => ({ id, name: trainerNames.get(id) ?? "" })),
    students: [...assigned, ...unassigned].map((s) => {
      const t = transfers.find((x) => x.studentId === s.id);
      return {
        studentId: s.id,
        name: s.name,
        phoneMasked: centerCanSeeContact(windows, s.currentTrainerId)
          ? maskPhone(s.phone)
          : null,
        trainerId: s.currentTrainerId,
        trainerName: s.currentTrainerId
          ? (trainerNames.get(s.currentTrainerId) ?? "")
          : null,
        passCount: s.passes.length,
        suspendedPasses: s.passes.filter((p) => p.status === "SUSPENDED")
          .length,
        transfer: t
          ? {
              id: t.id,
              status: t.status,
              passTransfer: t.passTransfer,
              fromTrainerId: t.fromTrainerId,
              toTrainerId: t.toTrainerId,
            }
          : null,
      };
    }),
  };
}

/** 소속 기간 안의 기록만 남긴 통계 입력 */
async function centerStatStudents(
  db: Db,
  windows: Parameters<typeof centerCanSee>[0],
  trainerIds: string[],
) {
  const links = await db.trainerStudentLink.findMany({
    where: { trainerId: { in: trainerIds } },
    select: { studentId: true },
  });
  const ids = [...new Set(links.map((l) => l.studentId))];
  const students = await db.student.findMany({
    where: { id: { in: ids } },
    include: {
      trainerLinks: { orderBy: { startedAt: "desc" } },
      passes: true,
      bookings: {
        select: {
          id: true,
          startAt: true,
          trainerId: true,
          status: true,
          deducted: true,
          passId: true,
          lateCancel: true,
        },
      },
    },
  });
  return students.map<StatStudent>((s) => ({
    id: s.id,
    name: s.name,
    assignments: s.trainerLinks.map((l) => ({
      trainerId: l.trainerId,
      start: toKstDateKey(l.startedAt),
      end: l.endedAt ? toKstDateKey(l.endedAt) : null,
    })),
    passes: s.passes
      .filter((p) =>
        centerCanSeeDate(
          windows,
          p.soldByTrainerId,
          toKstDateKey(p.paidAt ?? p.createdAt),
          toKstDateKey,
        ),
      )
      .map((p) => ({
        id: p.id,
        count: p.count,
        bonusCount: p.bonusCount,
        startDate: toKstDateKey(p.startDate),
        endDate: toKstDateKey(p.endDate),
        status: p.status,
        soldByTrainerId: p.soldByTrainerId,
        price: p.price,
        paidAt: p.paidAt ? toKstDateKey(p.paidAt) : null,
      })),
    bookings: s.bookings
      .filter((b) => centerCanSee(windows, b.trainerId, b.startAt))
      .map((b) => ({
        id: b.id,
        date: toKstDateKey(b.startAt),
        trainerId: b.trainerId,
        status: b.status,
        deducted: b.deducted,
        passId: b.passId,
        lateCancel: b.lateCancel,
      })),
  }));
}

/** 수강 현황: 트레이너별 또는 센터 합계, 트레이너별 수업 수·노쇼율 비교 */
export async function getCenterStats(
  db: Db,
  adminId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const { center, windows } = await requireCenterAdmin(db, adminId);
  period(from, to);
  const ids = visibleTrainers(windows);
  const students = await centerStatStudents(db, windows, ids);
  const names = new Map(
    (
      await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  const byTrainer = ids.map((trainerId) => {
    const rows = computeTrainerStats({
      trainerId,
      from,
      to,
      today: toKstDateKey(now),
      students,
    });
    return {
      trainerId,
      trainerName: names.get(trainerId) ?? "",
      rows,
      summary: summarizeStats({ trainerId, from, to, rows, students }),
    };
  });
  const completed = byTrainer.reduce((n, t) => n + t.summary.totalClasses, 0);
  const noShow = byTrainer.reduce(
    (n, t) => n + t.rows.reduce((m, r) => m + r.noShow, 0),
    0,
  );
  await logView(db, adminId, center.id, "stats", { from, to });
  return {
    byTrainer,
    total: {
      totalClasses: completed,
      noShowRate: completed + noShow === 0 ? 0 : noShow / (completed + noShow),
      paymentSum: byTrainer.reduce((n, t) => n + t.summary.paymentSum, 0),
    },
  };
}

/** 결제 기록: 기간별·트레이너별 합계 (판매 트레이너가 소속이던 기간의 결제만) */
export async function getCenterPayments(
  db: Db,
  adminId: string,
  from: string,
  to: string,
) {
  const { center, windows } = await requireCenterAdmin(db, adminId);
  const r = period(from, to);
  const ids = visibleTrainers(windows);
  const passes = await db.pass.findMany({
    where: {
      soldByTrainerId: { in: ids },
      paidAt: { gte: r.start, lt: r.end },
    },
    include: {
      student: { select: { name: true } },
      soldByTrainer: { select: { name: true } },
    },
    orderBy: { paidAt: "asc" },
  });
  const visible = passes.filter((p) =>
    centerCanSeeDate(
      windows,
      p.soldByTrainerId,
      toKstDateKey(p.paidAt!),
      toKstDateKey,
    ),
  );
  const sums = new Map<
    string,
    { trainerName: string; count: number; amount: number }
  >();
  for (const p of visible) {
    const cur = sums.get(p.soldByTrainerId) ?? {
      trainerName: p.soldByTrainer.name,
      count: 0,
      amount: 0,
    };
    cur.count += 1;
    cur.amount += p.price ?? 0;
    sums.set(p.soldByTrainerId, cur);
  }
  await logView(db, adminId, center.id, "payments", { from, to });
  return {
    items: visible.map((p) => ({
      passId: p.id,
      paidAt: toKstDateKey(p.paidAt!),
      studentName: p.student.name,
      trainerName: p.soldByTrainer.name,
      passName: p.name,
      price: p.price ?? 0,
      payMethod: p.payMethod,
      status: p.status,
    })),
    byTrainer: [...sums.entries()].map(([trainerId, v]) => ({
      trainerId,
      ...v,
    })),
    total: visible.reduce((n, p) => n + (p.price ?? 0), 0),
  };
}

export function paymentsCsv(
  items: {
    paidAt: string;
    studentName: string;
    trainerName: string;
    passName: string;
    price: number;
    payMethod: string | null;
    status: string;
  }[],
) {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = [
    "결제일",
    "수강생",
    "판매 트레이너",
    "이용권",
    "금액",
    "결제 수단",
    "상태",
  ];
  return `﻿${[head.join(","), ...items.map((i) => [i.paidAt, i.studentName, i.trainerName, i.passName, i.price, i.payMethod, i.status].map(esc).join(","))].join("\r\n")}\r\n`;
}
