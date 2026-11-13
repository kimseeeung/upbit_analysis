import { writeAuditLog } from "@/lib/audit";
import {
  allocateBookings,
  computeAvailableCount,
  isPassValidOn,
} from "@/lib/rules/availability";
import { isValidMobilePhone, maskPhone, normalizePhone } from "@/lib/phone";
import { toKstDateKey } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { loadCountInputs } from "@/server/passes/availability-service";
import { queueNotification } from "@/server/notify/notify-service";
import { assertTrainerStudent } from "./access";

/** 가입 수강생 불러오기: 이름 또는 전화번호 검색. 전화번호는 마스킹 (3.1) */
export async function searchRegisteredStudents(
  db: Db,
  trainerId: string,
  q: string,
) {
  const query = q.trim();
  if (query.length < 2) return [];
  const digits = normalizePhone(query);
  const rows = await db.student.findMany({
    where: {
      userId: { not: null },
      user: { status: "ACTIVE" },
      OR: [
        { name: { contains: query } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      currentTrainerId: true,
      linkRequests: {
        where: { status: "PENDING", fromUserId: trainerId },
        select: { id: true },
      },
    },
    take: 20,
    orderBy: { name: "asc" },
  });
  return rows.map((s) => ({
    studentId: s.id,
    name: s.name,
    phoneMasked: maskPhone(s.phone),
    linkedToMe: s.currentTrainerId === trainerId,
    hasTrainer: !!s.currentTrainerId && s.currentTrainerId !== trainerId,
    requestPending: s.linkRequests.length > 0,
  }));
}

/** 트레이너 → 가입 수강생 연결 동의 요청 */
export async function requestLinkToStudent(
  db: RootDb,
  trainerId: string,
  studentId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const s = await tx.student.findUnique({ where: { id: studentId } });
    if (!s?.userId)
      throw new AppError("NOT_FOUND", "수강생을 찾을 수 없습니다", 404);
    if (s.currentTrainerId === trainerId)
      throw new AppError("ALREADY_LINKED", "이미 연결된 수강생입니다");
    if (s.currentTrainerId) {
      throw new AppError(
        "HAS_TRAINER",
        "이미 담당 트레이너가 있는 수강생입니다. 담당 변경은 인계로 진행합니다",
      );
    }
    const existing = await tx.linkRequest.findFirst({
      where: { fromUserId: trainerId, studentId, status: "PENDING" },
    });
    if (existing) return existing;
    const req = await tx.linkRequest.create({
      data: {
        fromUserId: trainerId,
        toUserId: s.userId,
        studentId,
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "LinkRequest",
      entityId: req.id,
      action: "link.request",
      after: { studentId },
      at: now,
    });
    const trainer = await tx.user.findUniqueOrThrow({
      where: { id: trainerId },
    });
    await queueNotification(
      tx,
      {
        userId: s.userId,
        studentId,
        type: "LINK_REQUEST",
        title: "트레이너 연결 요청",
        body: `${trainer.name} 트레이너가 연결을 요청했습니다.`,
        url: "/s/requests",
        responseRequired: true,
      },
      now,
    );
    return req;
  });
}

async function startLink(
  tx: Db,
  trainerId: string,
  studentId: string,
  now: Date,
) {
  const s = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  if (s.currentTrainerId && s.currentTrainerId !== trainerId) {
    throw new AppError(
      "HAS_TRAINER",
      "이미 담당 트레이너가 있습니다. 담당 변경은 인계로 진행합니다",
    );
  }
  const active = await tx.trainerStudentLink.findFirst({
    where: { trainerId, studentId, endedAt: null },
  });
  if (!active) {
    await tx.trainerStudentLink.create({
      data: { trainerId, studentId, startedAt: now },
    });
  } else if (active.status === "HIDDEN") {
    await tx.trainerStudentLink.update({
      where: { id: active.id },
      data: { status: "ACTIVE" },
    });
  }
  await tx.student.update({
    where: { id: studentId },
    data: { currentTrainerId: trainerId },
  });
}

/** 연결 요청 수락·거절. 받은 사람만 응답할 수 있다 */
export async function respondLinkRequest(
  db: RootDb,
  input: { userId: string; requestId: string; accept: boolean },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const req = await tx.linkRequest.findFirst({
      where: { id: input.requestId, toUserId: input.userId, status: "PENDING" },
      include: {
        fromUser: { select: { role: true } },
        toUser: { select: { role: true } },
      },
    });
    if (!req) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    if (!req.studentId) throw new AppError("INVALID", "잘못된 요청입니다");
    const trainerId =
      req.fromUser.role === "TRAINER" ? req.fromUserId : req.toUserId;
    if (input.accept) await startLink(tx, trainerId, req.studentId, now);
    await tx.linkRequest.update({
      where: { id: req.id },
      data: {
        status: input.accept ? "ACCEPTED" : "REJECTED",
        respondedAt: now,
      },
    });
    // 같은 수강생에게 온 다른 대기 요청은 수락되면 의미가 없어진다
    if (input.accept) {
      await tx.linkRequest.updateMany({
        where: {
          studentId: req.studentId,
          status: "PENDING",
          id: { not: req.id },
        },
        data: { status: "CANCELED", respondedAt: now },
      });
    }
    await writeAuditLog(tx, {
      actor: { type: "USER", id: input.userId },
      entity: "LinkRequest",
      entityId: req.id,
      action: input.accept ? "link.accept" : "link.reject",
      after: { studentId: req.studentId, trainerId },
      at: now,
    });
    const me = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    await queueNotification(
      tx,
      {
        userId: req.fromUserId,
        type: "LINK_RESULT",
        title: input.accept ? "연결 수락" : "연결 거절",
        body: `${me.name}님이 연결 요청을 ${input.accept ? "수락" : "거절"}했습니다.`,
        url: req.fromUser.role === "TRAINER" ? "/t/students" : "/s",
      },
      now,
    );
  });
}

/** 미가입 수강생 임시 등록: 이름 + 전화번호 (3.1) */
export async function registerTemporaryStudent(
  db: RootDb,
  trainerId: string,
  input: { name: string; phone: string },
  now = new Date(),
) {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (!name) throw new AppError("INVALID", "이름을 입력해 주세요");
  if (!isValidMobilePhone(phone))
    throw new AppError("INVALID", "휴대폰 번호를 확인해 주세요");
  return db.$transaction(async (tx) => {
    const member = await tx.user.findUnique({
      where: { phone },
      select: { role: true },
    });
    if (member) {
      throw new AppError(
        "REGISTERED",
        member.role === "STUDENT"
          ? "이미 가입한 수강생입니다. '가입 수강생 불러오기'로 연결 요청을 보내 주세요"
          : "이 전화번호는 수강생으로 등록할 수 없습니다",
      );
    }
    const mine = await tx.student.findFirst({
      where: {
        phone,
        userId: null,
        trainerLinks: { some: { trainerId, endedAt: null } },
      },
    });
    if (mine) throw new AppError("DUPLICATE", "이미 임시 등록한 수강생입니다");
    const student = await tx.student.create({
      data: { name, phone, currentTrainerId: trainerId },
    });
    await tx.trainerStudentLink.create({
      data: { trainerId, studentId: student.id, startedAt: now },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "Student",
      entityId: student.id,
      action: "student.registerTemporary",
      after: { name },
      at: now,
    });
    return student;
  });
}

export type StudentListFilter = "ALL" | "ACTIVE" | "EXPIRED" | "STOPPED";

/**
 * 트레이너의 수강생 목록 (3.1). 상태:
 * - 수강 중: 오늘 쓸 수 있는 이용권(잔여 > 0)이 있음
 * - 만료: 쓸 수 있는 이용권이 없음 (이용권이 없는 경우 포함)
 * - 중단: 수강 종료(HIDDEN)
 * "담당 없음"은 센터 화면(M7)에서 쓴다.
 */
export async function listTrainerStudents(
  db: Db,
  trainerId: string,
  opts: { q?: string; filter?: StudentListFilter } = {},
  now = new Date(),
) {
  const links = await db.trainerStudentLink.findMany({
    where: {
      trainerId,
      endedAt: null,
      ...(opts.q?.trim()
        ? { student: { name: { contains: opts.q.trim() } } }
        : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          phone: true,
          userId: true,
          passes: {
            where: { status: { notIn: ["REFUNDED", "SUSPENDED"] } },
            select: {
              id: true,
              endDate: true,
              ruleSetVersionId: true,
              agreedRuleSetId: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { student: { name: "asc" } },
  });
  const today = toKstDateKey(now);
  const rows = await Promise.all(
    links.map(async (l) => {
      const { passes, bookings } = await loadCountInputs(db, l.studentId);
      const alloc = allocateBookings(passes, bookings);
      const usable = passes.filter(
        (p) => isPassValidOn(p, today) && alloc.remaining[p.id] > 0,
      );
      const remaining = usable.reduce((n, p) => n + alloc.remaining[p.id], 0);
      const status =
        l.status === "HIDDEN"
          ? "STOPPED"
          : usable.length > 0
            ? "ACTIVE"
            : "EXPIRED";
      const ruleUnagreed = l.student.passes.some(
        (p) =>
          p.status !== "EXPIRED" && p.agreedRuleSetId !== p.ruleSetVersionId,
      );
      const nextExpiry = usable.map((p) => p.endDate).sort()[0] ?? null;
      return {
        studentId: l.studentId,
        name: l.student.name,
        phoneMasked: maskPhone(l.student.phone),
        registered: !!l.student.userId,
        status,
        remaining,
        availableToday: computeAvailableCount(passes, bookings, today),
        nextExpiry,
        ruleUnagreed,
        notifyDayBefore: l.notifyDayBefore,
        notify2h: l.notify2h,
      } as const;
    }),
  );
  const filter = opts.filter ?? "ALL";
  return rows.filter((r) =>
    filter === "ALL" ? r.status !== "STOPPED" : r.status === filter,
  );
}

/** 수강 종료(목록에서 숨김) / 다시 수강 중으로 */
export async function setStudentHidden(
  db: RootDb,
  trainerId: string,
  studentId: string,
  hidden: boolean,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const link = await assertTrainerStudent(tx, trainerId, studentId);
    await tx.trainerStudentLink.update({
      where: { id: link.id },
      data: { status: hidden ? "HIDDEN" : "ACTIVE" },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "TrainerStudentLink",
      entityId: link.id,
      action: hidden ? "student.hide" : "student.unhide",
      at: now,
    });
  });
}

export async function updateTrainerMemo(
  db: RootDb,
  trainerId: string,
  studentId: string,
  memo: string,
) {
  const link = await assertTrainerStudent(db, trainerId, studentId);
  if (memo.length > 2000)
    throw new AppError("INVALID", "메모는 2,000자까지 쓸 수 있습니다");
  await db.trainerStudentLink.update({
    where: { id: link.id },
    data: { memo },
  });
}

/**
 * 가입 시 합칠 후보 (1.4): 같은 전화번호로 트레이너가 임시 등록해 둔 수강생.
 * 전화번호는 본인인증을 마친 번호라 본인으로 볼 수 있다.
 */
export async function findMergeCandidates(db: Db, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { phone: true, role: true },
  });
  if (user.role !== "STUDENT") return [];
  const rows = await db.student.findMany({
    where: { phone: user.phone, userId: null, currentTrainerId: { not: null } },
    include: {
      trainerLinks: {
        where: { endedAt: null },
        include: {
          trainer: {
            select: {
              name: true,
              trainerProfile: { select: { workplaceText: true } },
            },
          },
        },
      },
      _count: { select: { passes: true, bookings: true } },
    },
  });
  return rows.map((s) => ({
    studentId: s.id,
    trainerName: s.trainerLinks[0]?.trainer.name ?? "",
    workplace: s.trainerLinks[0]?.trainer.trainerProfile?.workplaceText ?? null,
    passCount: s._count.passes,
    bookingCount: s._count.bookings,
  }));
}

/**
 * "이 트레이너의 수강생이 맞나요?" → 예: 임시 등록 기록을 내 계정으로 합친다.
 * 가입 때 만든 빈 수강생 기록은 지우고, 가입 때 보낸 다른 트레이너 연결 요청은 닫는다.
 */
export async function mergeTemporaryStudent(
  db: RootDb,
  userId: string,
  tempStudentId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const temp = await tx.student.findFirst({
      where: { id: tempStudentId, userId: null, phone: user.phone },
    });
    if (!temp)
      throw new AppError("NOT_FOUND", "합칠 기록을 찾을 수 없습니다", 404);
    const fresh = await tx.student.findUnique({
      where: { userId },
      include: {
        _count: {
          select: { passes: true, bookings: true, trainerLinks: true },
        },
      },
    });
    if (fresh) {
      if (
        fresh._count.passes +
          fresh._count.bookings +
          fresh._count.trainerLinks >
        0
      ) {
        throw new AppError(
          "CONFLICT",
          "이미 수업 기록이 있어 합칠 수 없습니다",
        );
      }
      await tx.linkRequest.updateMany({
        where: { studentId: fresh.id, status: "PENDING" },
        data: { status: "CANCELED", respondedAt: now, studentId: temp.id },
      });
      await tx.linkRequest.updateMany({
        where: { studentId: fresh.id },
        data: { studentId: temp.id },
      });
      await tx.student.delete({ where: { id: fresh.id } });
    }
    await tx.student.update({
      where: { id: temp.id },
      data: { userId, name: user.name },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: userId },
      entity: "Student",
      entityId: temp.id,
      action: "student.mergeOnSignup",
      after: { removedStudentId: fresh?.id ?? null },
      at: now,
    });
  });
}
