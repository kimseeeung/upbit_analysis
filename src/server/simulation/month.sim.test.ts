/**
 * 한 달 운영 시뮬레이션 (통합 검사).
 * 트레이너·수강생 여러 명이 약 30일 동안 예약·확정·신청·취소·변경·노쇼·완료 승인·이의·
 * 일시정지·탈퇴를 겪게 하고, 매일 끝에 규칙(잔여 횟수, 중복, 상태 전이, 차감, 감사 로그,
 * 알림)을 검사한다. 업무 규칙에 따른 거절(AppError)은 정상으로 세고, 그 밖의 오류와
 * 규칙 위반은 문제로 모아 마지막에 실패시킨다.
 * 같은 결과를 다시 보려면 SIM_SEED로 시드를 고정한다.
 */
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRANSITIONS, OCCUPYING } from "@/lib/booking/state-machine";
import { kstDateTime, toKstDateKey, toKstParts } from "@/lib/time";
import { requestWithdraw } from "@/server/account/withdraw-service";
import {
  approveWithPin,
  markNoShow,
  raiseDispute,
  resolveDispute,
  trainerConfirmCompletion,
} from "@/server/bookings/approval-service";
import { saveAvailability } from "@/server/bookings/availability-settings";
import {
  cancelByTrainer,
  chooseProposal,
  createBookingsByTrainer,
  proposeOtherTimes,
  requestBookingByStudent,
  requestCancelByStudent,
  requestTimeChange,
  respondBookingRequest,
  respondCancelRequest,
  respondConfirmRequest,
  respondTimeChange,
  withdrawBookingRequest,
} from "@/server/bookings/booking-service";
import { AppError } from "@/server/errors";
import { runAllJobs } from "@/server/jobs/run-all";
import { getAvailableCount } from "@/server/passes/availability-service";
import {
  addBonusCount,
  createPass,
  extendPass,
  refundPass,
} from "@/server/passes/pass-service";
import {
  createCenterForTrainer,
  createInvite,
  joinWithInvite,
} from "@/server/center/center-service";
import {
  respondTransferAsNewTrainer,
  respondTransferAsStudent,
  startTransfer,
} from "@/server/center/transfer-service";
import { requestPause, respondPause } from "@/server/passes/pause-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { getTrainerStats } from "@/server/stats/stats-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { makeUser, resetFactorySeq } from "@/test/factories";

const db = testDb();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const TRAINERS = 6;
const STUDENTS_PER_TRAINER = 5;
const DAYS = Number(process.env.SIM_DAYS ?? 30);
const START = kstDateTime(2026, 11, 14, 0, 0);

/** 시드 고정 난수 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SIM_SEED ?? 20261114);
const rand = rng(SEED);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

interface Trainer {
  userId: string;
  name: string;
}
interface Student {
  userId: string;
  studentId: string;
  trainerUserId: string;
  pin: string;
  withdrawn: boolean;
}

const trainers: Trainer[] = [];
const students: Student[] = [];

/** 결과 기록 */
const report = {
  seed: SEED,
  actions: {} as Record<string, number>,
  businessRejections: {} as Record<string, number>,
  problems: [] as { day: string; kind: string; detail: string }[],
};
function count(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/** 서비스 호출: 업무 규칙 거절은 세고 넘어가며, 그 밖의 오류는 문제로 기록 */
async function act(
  name: string,
  now: Date,
  fn: () => Promise<unknown>,
  onNoRemaining?: () => Promise<void>,
) {
  try {
    await fn();
    count(report.actions, name);
    return true;
  } catch (e) {
    if (e instanceof AppError) {
      count(report.businessRejections, `${name}:${e.code}`);
      if (e.code === "NO_REMAINING" && onNoRemaining) await onNoRemaining();
      return false;
    }
    report.problems.push({
      day: toKstDateKey(now),
      kind: `예외:${name}`,
      detail:
        e instanceof Error
          ? `${e.name}: ${e.message}`.slice(0, 400)
          : String(e),
    });
    return false;
  }
}

/** 근무 시간 안의 정시 (09~20시) */
function futureSlot(now: Date, minDays: number, maxDays: number): Date {
  const d = new Date(
    now.getTime() +
      (minDays + Math.floor(rand() * (maxDays - minDays + 1))) * DAY,
  );
  const [y, m, day] = toKstDateKey(d).split("-").map(Number);
  return kstDateTime(y, m, day, 9 + Math.floor(rand() * 12), pick([0, 0, 30]));
}

beforeAll(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();

  for (let t = 0; t < TRAINERS; t++) {
    const u = await makeUser("TRAINER", { name: `트레이너${t + 1}` });
    trainers.push({ userId: u.userId, name: `트레이너${t + 1}` });
    await saveAvailability(
      db,
      u.userId,
      {
        // 일요일 휴무, 월~토 09~21시 (한 트레이너는 토요일도 휴무)
        rules: [1, 2, 3, 4, 5, ...(t === 0 ? [] : [6])].map((weekday) => ({
          weekday,
          startTime: "09:00",
          endTime: "21:00",
        })),
        exceptions: [],
      },
      START,
    );
  }

  for (const [ti, tr] of trainers.entries()) {
    for (let s = 0; s < STUDENTS_PER_TRAINER; s++) {
      const u = await makeUser("STUDENT", {
        name: `수강생${ti + 1}-${s + 1}`,
        trainer: { trainerUserId: tr.userId },
      });
      const req = await db.linkRequest.findFirstOrThrow({
        where: { fromUserId: u.userId },
      });
      await respondLinkRequest(
        db,
        { userId: tr.userId, requestId: req.id, accept: true },
        START,
      );
      const studentId = (
        await db.student.findUniqueOrThrow({ where: { userId: u.userId } })
      ).id;
      students.push({
        userId: u.userId,
        studentId,
        trainerUserId: tr.userId,
        pin: "1357",
        withdrawn: false,
      });
      // 이용권: 횟수·만료일을 다양하게 (일부는 시뮬레이션 중 만료, 일부는 적은 횟수)
      const passes = s === 4 ? 2 : 1;
      for (let p = 0; p < passes; p++) {
        const count = pick([3, 5, 8, 10, 20]);
        const end = pick([
          "2026-11-30",
          "2026-12-05",
          "2027-02-28",
          "2027-02-28",
        ]);
        const pass = await createPass(
          db,
          tr.userId,
          studentId,
          {
            name: `PT ${count}회`,
            count,
            startDate: "2026-11-01",
            endDate: end,
          },
          START,
        );
        // 20%는 수강 규칙에 동의하지 않은 채로 진행
        if (!chance(0.2)) {
          const c = await db.ruleConsent.findFirstOrThrow({
            where: { passId: pass.id },
          });
          await respondRuleConsent(
            db,
            { studentUserId: u.userId, consentId: c.id, action: "AGREE" },
            START,
          );
        }
      }
    }
  }

  // 센터: 트레이너1이 센터를 만들고 트레이너2·3을 초대
  await createCenterForTrainer(
    db,
    trainers[0].userId,
    { name: "머슬 강남점", address: "서울 강남구", phone: "0212345678" },
    START,
  );
  for (const t of trainers.slice(1, 3)) {
    const { code } = await createInvite(
      db,
      trainers[0].userId,
      "TRAINER",
      START,
    );
    await joinWithInvite(db, t.userId, code, true, START);
  }
}, 600_000);

/** 담당 트레이너 인계 (센터 안): 미래 예약은 새 트레이너가 이어 받는다 */
async function transfer(
  now: Date,
  s: Student,
  to: Trainer,
  initiator: "TRAINER" | "CENTER_ADMIN",
) {
  const actor = initiator === "TRAINER" ? s.trainerUserId : trainers[0].userId;
  let id = "";
  const ok = await act(`인계 시작(${initiator})`, now, async () => {
    const t = await startTransfer(
      db,
      {
        initiator,
        actorUserId: actor,
        studentId: s.studentId,
        toTrainerId: to.userId,
        passAgree: true,
      },
      now,
    );
    id = t.id;
  });
  if (!ok) return;
  if (
    !(await act("인계 수락(새 트레이너)", now, () =>
      respondTransferAsNewTrainer(
        db,
        { trainerId: to.userId, transferId: id, accept: true },
        now,
      ),
    ))
  )
    return;
  if (
    await act("인계 동의(수강생)", now, () =>
      respondTransferAsStudent(
        db,
        { userId: s.userId, transferId: id, agree: true },
        now,
      ),
    )
  ) {
    const cur = await db.student.findUniqueOrThrow({
      where: { id: s.studentId },
    });
    if (cur.currentTrainerId !== to.userId)
      report.problems.push({
        day: toKstDateKey(now),
        kind: "인계 후 담당 불일치",
        detail: s.studentId,
      });
    s.trainerUserId = to.userId;
    for (const c of await db.ruleConsent.findMany({
      where: { studentId: s.studentId, status: "PENDING" },
    }))
      await act("인계 후 규칙 재동의", now, () =>
        respondRuleConsent(
          db,
          { studentUserId: s.userId, consentId: c.id, action: "AGREE" },
          now,
        ),
      );
    const future = await db.booking.findMany({
      where: {
        studentId: s.studentId,
        startAt: { gt: now },
        status: { in: ["CONFIRMED", "PENDING_CONFIRM", "REQUESTED"] },
      },
    });
    for (const b of future)
      if (b.trainerId !== to.userId)
        report.problems.push({
          day: toKstDateKey(now),
          kind: "인계 후 예약 트레이너 불일치",
          detail: b.id,
        });
  }
}

afterAll(async () => {
  if (process.env.SIM_REPORT)
    writeFileSync(process.env.SIM_REPORT, JSON.stringify(report, null, 2));
  await db.$disconnect();
});

/** "잔여 없음"으로 시간 변경이 거절됐을 때: 새 날짜에 쓸 수 있는 이용권이 정말 없는지 확인 */
async function explainNoRemaining(
  bookingId: string,
  newStart: string | undefined,
  now: Date,
) {
  if (!newStart) return;
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const day = toKstDateKey(new Date(newStart));
  const passes = await db.pass.findMany({ where: { studentId: b.studentId } });
  const valid = passes.filter(
    (p) =>
      p.status === "ACTIVE" &&
      toKstDateKey(p.startDate) <= day &&
      toKstDateKey(p.endDate) >= day,
  );
  const reasons = (report as Record<string, unknown>).noRemainingReasons as
    Record<string, number> | undefined;
  const r = reasons ?? {};
  (report as Record<string, unknown>).noRemainingReasons = r;
  if (valid.length === 0)
    return void count(r, "새 날짜에 유효한 이용권 없음(만료·정지)");
  const paused = await db.passPause.count({
    where: {
      passId: { in: valid.map((p) => p.id) },
      status: "APPROVED",
      startDate: { lte: new Date(`${day}T00:00:00+09:00`) },
      endDate: { gte: new Date(`${day}T00:00:00+09:00`) },
    },
  });
  if (paused >= valid.length) return void count(r, "새 날짜가 일시정지 기간");
  const left = valid.reduce(
    (a, p) =>
      a +
      p.count +
      p.bonusCount -
      p.usedCount -
      p.deductedNoShow -
      p.deductedLateCancel,
    0,
  );
  const others = await db.booking.count({
    where: {
      studentId: b.studentId,
      id: { not: b.id },
      status: {
        in: ["REQUESTED", "PENDING_CONFIRM", "CONFIRMED", "PENDING_APPROVAL"],
      },
      // 예정 예약은 차감 전까지 이용권이 정해지지 않으므로 수강생의 예정 예약 전체를 센다
    },
  });
  if (left - others <= 0)
    count(r, "새 날짜의 이용권 횟수가 다른 예약에 모두 배정됨");
  else {
    count(r, "확인 필요");
    const dbg = await db.pass.findMany({
      where: { studentId: b.studentId },
      include: { pauses: true },
    });
    const avail = await getAvailableCount(db, b.studentId, day, {
      excludeBookingId: b.id,
    });
    report.problems.push({
      day: toKstDateKey(now),
      kind: "잔여 계산 확인 필요",
      detail: `${bookingId} → ${day}: 남은 ${left}, 다른 예약 ${others}, 계산 ${avail}, 이용권 ${JSON.stringify(dbg.map((p) => ({ s: p.status, st: toKstDateKey(p.startDate), en: toKstDateKey(p.endDate), pauses: p.pauses.map((x) => [x.status, toKstDateKey(x.startDate), toKstDateKey(x.endDate)]) })))}`,
    });
  }
}

/** 한 시간 동안 일어나는 일 */
async function hour(now: Date) {
  const h = toKstParts(now).hour;
  const active = students.filter((s) => !s.withdrawn);
  if (h < 7 || h > 23) return;

  // 1) 트레이너가 예약 등록 (가끔 반복 예약)
  for (let i = 0; i < 2; i++) {
    if (!chance(0.5)) continue;
    const s = pick(active);
    const recurring = chance(0.1);
    await act(
      recurring ? "트레이너 반복 예약" : "트레이너 예약 등록",
      now,
      () =>
        createBookingsByTrainer(
          db,
          {
            trainerId: s.trainerUserId,
            studentId: s.studentId,
            start: futureSlot(now, 1, 10),
            durationMinutes: pick([50, 50, 60, 30]),
            acknowledgeWarnings: true,
            recurrence: recurring
              ? {
                  weekdays: [toKstParts(futureSlot(now, 1, 6)).weekday],
                  count: 4,
                }
              : null,
          },
          now,
        ),
    );
  }

  // 2) 수강생이 빈 시간 신청
  if (chance(0.4)) {
    const s = pick(active);
    await act("수강생 예약 신청", now, () =>
      requestBookingByStudent(
        db,
        { userId: s.userId, start: futureSlot(now, 1, 8) },
        now,
      ),
    );
  }

  // 3) 수강생: 확정 요청에 응답 (수락·거절·다른 시간 제안)
  const pendings = await db.booking.findMany({
    where: { status: "PENDING_CONFIRM", startAt: { gt: now } },
    take: 6,
  });
  for (const b of pendings) {
    const s = students.find((x) => x.studentId === b.studentId);
    if (!s || s.withdrawn || !chance(0.5)) continue;
    const r = rand();
    if (r < 0.8)
      await act("확정 요청 수락", now, () =>
        respondConfirmRequest(
          db,
          {
            userId: s.userId,
            bookingId: b.id,
            accept: true,
            wholeGroup: !!b.recurringGroupId,
          },
          now,
        ),
      );
    else if (r < 0.9)
      await act("확정 요청 거절", now, () =>
        respondConfirmRequest(
          db,
          {
            userId: s.userId,
            bookingId: b.id,
            accept: false,
            reason: "일정이 안 맞아요",
          },
          now,
        ),
      );
    else {
      const start = futureSlot(now, 2, 9);
      await act("다른 시간 제안", now, () =>
        proposeOtherTimes(
          db,
          {
            userId: s.userId,
            bookingId: b.id,
            slots: [
              {
                start,
                end: new Date(
                  start.getTime() + (b.endAt.getTime() - b.startAt.getTime()),
                ),
              },
            ],
          },
          now,
        ),
      );
    }
  }

  // 4) 트레이너: 제안 고르기, 신청 수락·거절
  const proposals = await db.bookingChangeRequest.findMany({
    where: { kind: "PROPOSAL", status: "PENDING" },
    include: { booking: true },
    take: 3,
  });
  for (const p of proposals)
    if (chance(0.6))
      await act("제안 시간 선택", now, () =>
        chooseProposal(
          db,
          { trainerId: p.booking.trainerId, requestId: p.id, index: 0 },
          now,
        ),
      );
  const requested = await db.booking.findMany({
    where: { status: "REQUESTED", startAt: { gt: now } },
    take: 5,
  });
  for (const b of requested) {
    if (!chance(0.6)) continue;
    if (chance(0.05)) {
      const s = students.find((x) => x.studentId === b.studentId);
      if (s && !s.withdrawn)
        await act("수강생 신청 철회", now, () =>
          withdrawBookingRequest(
            db,
            { userId: s.userId, bookingId: b.id },
            now,
          ),
        );
      continue;
    }
    await act(chance(0.85) ? "신청 수락" : "신청 거절", now, () =>
      respondBookingRequest(
        db,
        {
          trainerId: b.trainerId,
          bookingId: b.id,
          accept: chance(0.85),
          reason: "그 시간은 어려워요",
        },
        now,
      ),
    );
  }

  // 5) 확정된 예약: 취소 요청·트레이너 취소·시간 변경
  const confirmed = await db.booking.findMany({
    where: { status: "CONFIRMED", startAt: { gt: now } },
    take: 30,
  });
  if (confirmed.length > 0) {
    if (chance(0.15)) {
      const b = pick(confirmed);
      const s = students.find((x) => x.studentId === b.studentId);
      if (s && !s.withdrawn)
        await act("수강생 취소 요청", now, () =>
          requestCancelByStudent(
            db,
            { userId: s.userId, bookingId: b.id, reason: "개인 사정" },
            now,
          ),
        );
    }
    if (chance(0.05)) {
      const b = pick(confirmed);
      await act("트레이너 취소", now, () =>
        cancelByTrainer(
          db,
          { trainerId: b.trainerId, bookingId: b.id, reason: "센터 사정" },
          now,
        ),
      );
    }
    if (chance(0.1)) {
      const b = pick(confirmed);
      const start = futureSlot(now, 1, 7);
      const len = b.endAt.getTime() - b.startAt.getTime();
      await act("시간 변경 요청", now, () =>
        requestTimeChange(
          db,
          {
            actorUserId: b.trainerId,
            role: "TRAINER",
            bookingId: b.id,
            slots: [{ start, end: new Date(start.getTime() + len) }],
          },
          now,
        ),
      );
    }
  }
  const cancelReqs = await db.booking.findMany({
    where: { status: "CONFIRMED", cancelRequestedAt: { not: null } },
    take: 5,
  });
  for (const b of cancelReqs)
    if (chance(0.7))
      await act("취소 요청 응답", now, () =>
        respondCancelRequest(
          db,
          {
            trainerId: b.trainerId,
            bookingId: b.id,
            accept: chance(0.9),
            reason: "확인했습니다",
          },
          now,
        ),
      );
  const changes = await db.bookingChangeRequest.findMany({
    where: { kind: { not: "PROPOSAL" }, status: "PENDING" },
    include: { booking: true },
    take: 5,
  });
  for (const c of changes) {
    const s = students.find((x) => x.studentId === c.booking.studentId);
    if (!s || s.withdrawn || !chance(0.6)) continue;
    await act(
      "시간 변경 응답",
      now,
      () =>
        respondTimeChange(
          db,
          {
            actorUserId: s.userId,
            role: "STUDENT",
            requestId: c.id,
            action: chance(0.8) ? "ACCEPT" : "REJECT",
            index: 0,
          },
          now,
        ),
      () =>
        explainNoRemaining(
          c.bookingId,
          (c.proposedSlots as { startAt: string }[])[0]?.startAt,
          now,
        ),
    );
  }

  // 6) 끝난 수업: 승인·노쇼·이의·트레이너 확정
  const approvals = await db.booking.findMany({
    where: { status: "PENDING_APPROVAL" },
    take: 10,
  });
  for (const b of approvals) {
    const s = students.find((x) => x.studentId === b.studentId);
    const r = rand();
    if (b.trainerConfirmNeeded && chance(0.5)) {
      await act("트레이너 완료 확정", now, () =>
        trainerConfirmCompletion(
          db,
          { trainerId: b.trainerId, bookingId: b.id },
          now,
        ),
      );
    } else if (r < 0.35 && s && !s.withdrawn) {
      await act("수강생 앱 PIN 승인", now, () =>
        approveWithPin(
          db,
          {
            bookingId: b.id,
            pin: s.pin,
            method: "PIN_APP",
            studentUserId: s.userId,
          },
          now,
        ),
      );
    } else if (r < 0.45 && s && !s.withdrawn) {
      await act("현장 PIN 승인", now, () =>
        approveWithPin(
          db,
          {
            bookingId: b.id,
            pin: s.pin,
            method: "PIN_ONSITE",
            trainerId: b.trainerId,
          },
          now,
        ),
      );
    } else if (r < 0.47 && s && !s.withdrawn) {
      await act("틀린 PIN", now, () =>
        approveWithPin(
          db,
          {
            bookingId: b.id,
            pin: "0000",
            method: "PIN_APP",
            studentUserId: s.userId,
          },
          now,
        ),
      );
    } else if (r < 0.52) {
      await act("노쇼 처리", now, () =>
        markNoShow(db, { trainerId: b.trainerId, bookingId: b.id }, now),
      );
    } else if (r < 0.55 && s && !s.withdrawn) {
      await act("완료 이의 제기", now, () =>
        raiseDispute(
          db,
          {
            studentUserId: s.userId,
            bookingId: b.id,
            reason: "수업을 하지 않았어요",
          },
          now,
        ),
      );
    }
    // 나머지는 그대로 두어 자동 처리(24시간 뒤)를 거치게 한다
  }
  const noShows = await db.booking.findMany({
    where: { status: "NO_SHOW", disputeAt: null },
    take: 5,
  });
  for (const b of noShows) {
    const s = students.find((x) => x.studentId === b.studentId);
    if (s && !s.withdrawn && chance(0.1))
      await act("노쇼 이의 제기", now, () =>
        raiseDispute(
          db,
          {
            studentUserId: s.userId,
            bookingId: b.id,
            reason: "제시간에 갔어요",
          },
          now,
        ),
      );
  }
  const disputes = await db.booking.findMany({
    where: { disputeAt: { not: null }, disputeResolvedAt: null },
    take: 5,
  });
  for (const b of disputes)
    if (chance(0.3))
      await act("이의 처리", now, () =>
        resolveDispute(
          db,
          {
            trainerId: b.trainerId,
            bookingId: b.id,
            decision: chance(0.5) ? "ACCEPT_STUDENT" : "KEEP",
            reason: "확인함",
          },
          now,
        ),
      );

  // 7) 일시정지 요청·승인 (드물게)
  if (chance(0.02)) {
    const s = pick(active);
    const pass = await db.pass.findFirst({
      where: { studentId: s.studentId, status: "ACTIVE" },
    });
    if (pass) {
      const from = toKstDateKey(new Date(now.getTime() + 3 * DAY));
      const to = toKstDateKey(new Date(now.getTime() + 7 * DAY));
      await act("일시정지 요청", now, () =>
        requestPause(
          db,
          {
            actor: { role: "STUDENT", userId: s.userId },
            passId: pass.id,
            startDate: from,
            endDate: to,
            reason: "출장",
          },
          now,
        ),
      );
    }
  }
  const pauses = await db.passPause.findMany({
    where: { status: "PENDING" },
    include: { pass: true },
  });
  for (const p of pauses) {
    const s = students.find((x) => x.studentId === p.pass.studentId);
    if (s && chance(0.5))
      await act("일시정지 응답", now, () =>
        respondPause(
          db,
          {
            actor: { role: "TRAINER", userId: s.trainerUserId },
            pauseId: p.id,
            approve: chance(0.8),
          },
          now,
        ),
      );
  }
}

/** 하루 끝 검사 */
async function checkInvariants(now: Date) {
  const day = toKstDateKey(now);
  const problem = (kind: string, detail: string) =>
    report.problems.push({ day, kind, detail });

  // 1) 예약 가능 횟수는 음수가 될 수 없다
  for (const s of students.filter((x) => !x.withdrawn)) {
    const n = await getAvailableCount(db, s.studentId, day);
    if (n < 0) problem("잔여 음수", `${s.studentId}: ${n}`);
  }

  // 2) 이용권별 차감 수 ≤ 총 횟수, 캐시와 실제 일치
  const passes = await db.pass.findMany();
  for (const p of passes) {
    const ded = await db.booking.groupBy({
      by: ["deductReason"],
      where: { passId: p.id, deducted: true },
      _count: true,
    });
    const by = Object.fromEntries(ded.map((d) => [d.deductReason, d._count]));
    const total =
      (by.COMPLETED ?? 0) + (by.NO_SHOW ?? 0) + (by.LATE_CANCEL ?? 0);
    if (total > p.count + p.bonusCount)
      problem(
        "초과 차감",
        `${p.id}: 차감 ${total} > ${p.count + p.bonusCount}`,
      );
    if ((by.COMPLETED ?? 0) !== p.usedCount)
      problem(
        "사용 횟수 캐시 불일치",
        `${p.id}: usedCount ${p.usedCount}, 실제 ${by.COMPLETED ?? 0}`,
      );
    if ((by.NO_SHOW ?? 0) !== p.deductedNoShow)
      problem(
        "노쇼 차감 캐시 불일치",
        `${p.id}: ${p.deductedNoShow}, 실제 ${by.NO_SHOW ?? 0}`,
      );
    if ((by.LATE_CANCEL ?? 0) !== p.deductedLateCancel)
      problem(
        "당일 취소 차감 캐시 불일치",
        `${p.id}: ${p.deductedLateCancel}, 실제 ${by.LATE_CANCEL ?? 0}`,
      );
  }

  // 3) 차감은 완료·노쇼·당일 취소에만
  const badDeduct = await db.booking.findMany({
    where: {
      deducted: true,
      status: { notIn: ["COMPLETED", "NO_SHOW", "CANCELED"] },
    },
    select: { id: true, status: true },
  });
  for (const b of badDeduct) problem("잘못된 차감", `${b.id}: ${b.status}`);

  // 4) 같은 트레이너의 진행 중 예약은 시간이 겹치지 않는다
  const occ = await db.booking.findMany({
    where: { status: { in: [...OCCUPYING] } },
    select: { id: true, trainerId: true, startAt: true, endAt: true },
    orderBy: [{ trainerId: "asc" }, { startAt: "asc" }],
  });
  for (let i = 1; i < occ.length; i++) {
    const a = occ[i - 1];
    const b = occ[i];
    if (a.trainerId === b.trainerId && b.startAt < a.endAt)
      problem("시간 겹침", `${a.id} / ${b.id}`);
  }

  // 5) 상태 전이는 표에 있는 것만, 마지막 기록 = 지금 상태
  // 탈퇴로 삭제된 수강생의 예약은 이력을 지우므로(2.4) 제외
  const bookings = await db.booking.findMany({
    where: { student: { userId: { not: null } } },
    select: {
      id: true,
      status: true,
      statusLogs: {
        orderBy: [{ at: "asc" }, { createdAt: "asc" }],
        select: { from: true, to: true },
      },
    },
  });
  for (const b of bookings) {
    for (const l of b.statusLogs)
      if (l.from && l.from !== l.to && !TRANSITIONS[l.from].includes(l.to))
        problem("허용되지 않은 전이", `${b.id}: ${l.from}→${l.to}`);
    const last = b.statusLogs.at(-1);
    if (!last || last.to !== b.status)
      problem(
        "상태 기록 누락",
        `${b.id}: 지금 ${b.status}, 마지막 기록 ${last?.to ?? "없음"}`,
      );
  }

  // 6) 감사 로그: 모든 예약에 기록
  const audited = new Set(
    (
      await db.auditLog.findMany({
        where: { entity: "Booking" },
        select: { entityId: true },
        distinct: ["entityId"],
      })
    ).map((a) => a.entityId),
  );
  for (const b of bookings)
    if (!audited.has(b.id)) problem("감사 로그 누락", b.id);

  // 7) 취소된 예약에 수업 알림을 보내지 않는다
  const sentReminders = await db.notification.findMany({
    where: {
      type: { in: ["DAY_BEFORE", "TWO_HOURS"] },
      status: "SENT",
      bookingId: { not: null },
    },
    select: { id: true, type: true, bookingId: true, sentAt: true },
  });
  const closed = new Map(
    (
      await db.booking.findMany({
        where: {
          id: { in: sentReminders.map((n) => n.bookingId!) },
          status: { in: ["CANCELED", "REJECTED", "EXPIRED"] },
        },
        select: {
          id: true,
          statusLogs: {
            orderBy: { at: "desc" },
            take: 1,
            select: { at: true },
          },
        },
      })
    ).map((b) => [b.id, b.statusLogs[0]?.at]),
  );
  for (const n of sentReminders) {
    const closedAt = closed.get(n.bookingId!);
    if (closedAt && n.sentAt && n.sentAt > closedAt)
      problem("취소 뒤 수업 알림", `${n.id} (${n.type})`);
  }

  // 8) 지난 시간에 아직 "확정 대기·신청 대기·확정"인 예약이 남지 않는다 (자동 처리)
  const stale = await db.booking.findMany({
    where: {
      status: { in: ["PENDING_CONFIRM", "REQUESTED"] },
      startAt: { lt: new Date(now.getTime() - HOUR) },
    },
    select: { id: true, status: true },
  });
  for (const b of stale) problem("자동 처리 누락", `${b.id}: ${b.status}`);
  const staleConfirmed = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      endAt: { lt: new Date(now.getTime() - HOUR) },
    },
    select: { id: true },
  });
  for (const b of staleConfirmed) problem("수업 종료 처리 누락", b.id);
}

describe("한 달 운영 시뮬레이션", () => {
  it(`트레이너 ${TRAINERS}명 · 수강생 ${TRAINERS * STUDENTS_PER_TRAINER}명 · ${DAYS}일`, async () => {
    for (let d = 0; d < DAYS; d++) {
      for (let h = 0; h < 24; h++) {
        const now = new Date(START.getTime() + d * DAY + h * HOUR);
        await act("자동 처리", now, () => runAllJobs(db, now));
        await hour(now);
      }
      const endOfDay = new Date(START.getTime() + (d + 1) * DAY - 1000);
      // 9일째: 트레이너1 → 트레이너2 인계, 16일째: 센터 관리자가 트레이너3 → 트레이너2 인계
      if (d === 8)
        await transfer(endOfDay, students[0], trainers[1], "TRAINER");
      if (d === 15) {
        const s3 = students.find(
          (x) => x.trainerUserId === trainers[2].userId && !x.withdrawn,
        );
        if (s3) await transfer(endOfDay, s3, trainers[1], "CENTER_ADMIN");
      }
      // 18일째: 만료일 연장·서비스 횟수 추가·환불
      if (d === 17) {
        for (const s of students.slice(5, 8)) {
          const pass = await db.pass.findFirst({
            where: {
              studentId: s.studentId,
              status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] },
            },
          });
          if (!pass) continue;
          await act("만료일 연장", endOfDay, () =>
            extendPass(db, s.trainerUserId, pass.id, "2027-06-30", endOfDay),
          );
          await act("서비스 횟수 추가", endOfDay, () =>
            addBonusCount(db, s.trainerUserId, pass.id, 2, endOfDay),
          );
        }
        const s9 = students[9];
        const pass9 = await db.pass.findFirst({
          where: { studentId: s9.studentId, status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
        });
        if (pass9)
          await act("이용권 환불", endOfDay, () =>
            refundPass(db, s9.trainerUserId, pass9.id, endOfDay),
          );
      }
      // 15일째에 수강생 한 명 탈퇴 신청
      if (d === 14) {
        const s = students[3];
        if (
          await act("수강생 탈퇴 신청", endOfDay, () =>
            requestWithdraw(
              db,
              { userId: s.userId, password: "abcd123!", reason: "이사" },
              endOfDay,
            ),
          )
        )
          s.withdrawn = true;
      }
      await checkInvariants(endOfDay);
    }

    // 수강 현황 합계 = 직접 센 값
    const from = toKstDateKey(START);
    const to = toKstDateKey(new Date(START.getTime() + DAYS * DAY));
    const end = new Date(START.getTime() + DAYS * DAY);
    for (const t of trainers) {
      const stats = await getTrainerStats(db, t.userId, from, to, end);
      const completed = await db.booking.count({
        where: {
          trainerId: t.userId,
          status: "COMPLETED",
          startAt: { gte: START, lt: end },
        },
      });
      const statCompleted = stats.rows.reduce((a, r) => a + r.completed, 0);
      if (statCompleted !== completed)
        report.problems.push({
          day: to,
          kind: "수강 현황 불일치",
          detail: `${t.name}: 통계 ${statCompleted}, 실제 ${completed}`,
        });
    }

    const finals = await db.booking.groupBy({ by: ["status"], _count: true });
    (report as Record<string, unknown>).finalStatuses = Object.fromEntries(
      finals.map((f) => [f.status, f._count]),
    );
    (report as Record<string, unknown>).notifications = Object.fromEntries(
      (await db.notification.groupBy({ by: ["status"], _count: true })).map(
        (f) => [f.status, f._count],
      ),
    );

    // 같은 문제는 한 번만 보여 준다
    const unique = new Map<string, (typeof report.problems)[number]>();
    for (const p of report.problems) unique.set(`${p.kind}|${p.detail}`, p);
    report.problems = [...unique.values()];
    expect(report.problems).toEqual([]);
  }, 3_600_000);
});
