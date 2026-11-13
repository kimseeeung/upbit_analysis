import {
  computeTrainerStats,
  summarizeStats,
  type StatStudent,
} from "@/lib/stats/stats";
import { addKstDays, parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";

function period(from: string, to: string) {
  try {
    const start = parseKstDateKey(from);
    const end = addKstDays(parseKstDateKey(to), 1);
    if (end <= start) throw new Error();
    if (end.getTime() - start.getTime() > 400 * 86400_000)
      throw new AppError("INVALID", "조회 기간은 400일까지입니다");
    return { start, end };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("INVALID", "조회 기간을 확인해 주세요");
  }
}

/** 통계 계산에 필요한 수강생 데이터 (담당 이력·이용권·예약) */
async function loadStudents(
  db: Db,
  studentIds: string[],
): Promise<StatStudent[]> {
  const students = await db.student.findMany({
    where: { id: { in: studentIds } },
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
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    // 같은 날 인계되면 새 담당이 먼저 맞도록 최근 담당부터
    assignments: s.trainerLinks.map((l) => ({
      trainerId: l.trainerId,
      start: toKstDateKey(l.startedAt),
      end: l.endedAt ? toKstDateKey(l.endedAt) : null,
    })),
    passes: s.passes.map((p) => ({
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
    bookings: s.bookings.map((b) => ({
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

/** 이 트레이너의 수강 현황 표 (6장). 담당했던 수강생 + 기간 안에 수업을 진행한 수강생 */
export async function getTrainerStats(
  db: Db,
  trainerId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const p = period(from, to);
  const [links, conducted] = await Promise.all([
    db.trainerStudentLink.findMany({
      where: { trainerId },
      select: { studentId: true },
    }),
    db.booking.findMany({
      where: { trainerId, startAt: { gte: p.start, lt: p.end } },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
  ]);
  const ids = [
    ...new Set([
      ...links.map((l) => l.studentId),
      ...conducted.map((b) => b.studentId),
    ]),
  ];
  const students = await loadStudents(db, ids);
  const rows = computeTrainerStats({
    trainerId,
    from,
    to,
    today: toKstDateKey(now),
    students,
  });
  return {
    rows,
    summary: summarizeStats({ trainerId, from, to, rows, students }),
  };
}

/**
 * 수강생별 일자별 상세 (6장). 이용권별로 묶는다.
 * 지금 담당이면 전체 이력(진행 트레이너 표시), 이전 담당이면 자기가 맡았던 수업만 (7.1).
 */
export async function getStudentStatsDetail(
  db: Db,
  trainerId: string,
  studentId: string,
  from: string,
  to: string,
) {
  const p = period(from, to);
  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student)
    throw new AppError("NOT_FOUND", "수강생을 찾을 수 없습니다", 404);
  const current = student.currentTrainerId === trainerId;
  if (!current) {
    const touched =
      (await db.trainerStudentLink.count({ where: { trainerId, studentId } })) +
      (await db.booking.count({ where: { trainerId, studentId } }));
    if (touched === 0)
      throw new AppError("NOT_FOUND", "수강생을 찾을 수 없습니다", 404);
  }
  const bookings = await db.booking.findMany({
    where: {
      studentId,
      startAt: { gte: p.start, lt: p.end },
      ...(current ? {} : { trainerId }),
    },
    include: { trainer: { select: { name: true, status: true } } },
    orderBy: { startAt: "asc" },
  });
  const passes = await db.pass.findMany({
    where: { studentId },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true },
  });
  const groups = new Map<
    string,
    { passId: string | null; passName: string; items: unknown[] }
  >();
  for (const b of bookings) {
    const key = b.passId ?? "none";
    if (!groups.has(key)) {
      groups.set(key, {
        passId: b.passId,
        passName:
          passes.find((x) => x.id === b.passId)?.name ?? "차감 없음·예정",
        items: [],
      });
    }
    groups.get(key)!.items.push({
      id: b.id,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: b.status,
      trainerName:
        b.trainer.status === "DELETED" ? "탈퇴 트레이너" : b.trainer.name,
      approvedAt: b.approvedAt?.toISOString() ?? null,
      approvalMethod: b.approvalMethod,
      disputed: b.disputed,
      lateCancel: b.lateCancel,
      deducted: b.deducted,
      memo: b.memo,
    });
  }
  return { studentName: student.name, current, groups: [...groups.values()] };
}
