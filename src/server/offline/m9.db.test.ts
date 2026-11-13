import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/time";
import { runApprovalJobs } from "@/server/bookings/approval-service";
import {
  cancelByTrainer,
  createBookingsByTrainer,
  respondConfirmRequest,
} from "@/server/bookings/booking-service";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import {
  buildSnapshot,
  listConflicts,
  resolveConflict,
  syncOfflineOps,
  type QueuedOp,
} from "./offline-service";

const db = testDb();

async function setup() {
  const trainer = await makeUser("TRAINER");
  const student = await makeUser("STUDENT", {
    trainer: { trainerUserId: trainer.userId },
  });
  const req = await db.linkRequest.findFirstOrThrow({
    where: { fromUserId: student.userId },
  });
  await respondLinkRequest(
    db,
    { userId: trainer.userId, requestId: req.id, accept: true },
    T0,
  );
  const studentId = (
    await db.student.findUniqueOrThrow({ where: { userId: student.userId } })
  ).id;
  const pass = await createPass(
    db,
    trainer.userId,
    studentId,
    { name: "PT", count: 10, startDate: "2026-11-01", endDate: "2027-03-31" },
    T0,
  );
  const c = await db.ruleConsent.findFirstOrThrow({
    where: { passId: pass.id },
  });
  await respondRuleConsent(
    db,
    { studentUserId: student.userId, consentId: c.id, action: "AGREE" },
    T0,
  );
  return { trainer, student, studentId };
}

let n = 0;
const op = (o: QueuedOp["op"], createdAt: Date): QueuedOp => ({
  id: `op${++n}`,
  createdAt: createdAt.toISOString(),
  device: "iPhone · Safari",
  op: o,
});

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("휴대폰 백업 범위", () => {
  it("트레이너: 수강생·이용권·규칙·예약(±3개월)", async () => {
    const s = await setup();
    await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2027, 1, 20, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    const snap = await buildSnapshot(
      db,
      { userId: s.trainer.userId, role: "TRAINER" },
      T0,
    );
    expect(snap && "students" in snap && snap.students).toHaveLength(1);
    expect(snap && "calendar" in snap && snap.calendar.bookings).toHaveLength(
      1,
    );
    expect(
      await buildSnapshot(
        db,
        { userId: s.trainer.userId, role: "CENTER_ADMIN" },
        T0,
      ),
    ).toBeNull();
  });
});

describe("복구 후 동기화", () => {
  it("만든 순서대로 반영하고 오프라인 출처를 기록", async () => {
    const s = await setup();
    const results = await syncOfflineOps(
      db,
      s.trainer.userId,
      [
        op(
          {
            kind: "MEMO",
            payload: { studentId: s.studentId, memo: "오프라인 메모" },
          },
          kstDateTime(2026, 11, 13, 11, 1),
        ),
        op(
          {
            kind: "CREATE_BOOKING",
            payload: {
              studentId: s.studentId,
              startAt: kstDateTime(2026, 11, 20, 19).toISOString(),
            },
          },
          kstDateTime(2026, 11, 13, 11, 0),
        ),
      ],
      kstDateTime(2026, 11, 13, 12),
    );
    expect(results.map((r) => r.status)).toEqual(["APPLIED", "APPLIED"]);
    const b = await db.booking.findFirstOrThrow({
      where: { studentId: s.studentId },
    });
    expect(b.offlineOrigin).toMatchObject({ device: "iPhone · Safari" });
    expect(
      (
        await db.trainerStudentLink.findFirstOrThrow({
          where: { studentId: s.studentId },
        })
      ).memo,
    ).toBe("오프라인 메모");
  });

  it("같은 예약을 다른 기기에서 바꿨으면 서버 기록 유지 → 충돌 화면에서 선택", async () => {
    const s = await setup();
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 20, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    const id = r.created[0];
    const base = (
      await db.booking.findUniqueOrThrow({ where: { id } })
    ).updatedAt.toISOString();
    // 그 사이 다른 기기에서 수강생이 수락
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      kstDateTime(2026, 11, 13, 11),
    );
    const [res] = await syncOfflineOps(
      db,
      s.trainer.userId,
      [
        op(
          {
            kind: "CANCEL_BOOKING",
            payload: { bookingId: id, baseUpdatedAt: base },
          },
          kstDateTime(2026, 11, 13, 10, 30),
        ),
      ],
      kstDateTime(2026, 11, 13, 12),
    );
    expect(res.status).toBe("CONFLICT");
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
      "CONFIRMED",
    );
    const list = await listConflicts(db, s.trainer.userId);
    expect(list).toHaveLength(1);
    await resolveConflict(
      db,
      s.trainer.userId,
      list[0].id,
      "APPLY_LOCAL",
      kstDateTime(2026, 11, 13, 12, 5),
    );
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
      "CANCELED",
    );
    expect(await listConflicts(db, s.trainer.userId)).toHaveLength(0);
  });

  it("시간 겹침은 서버에 먼저 들어온 예약 우선, 나중 것은 충돌 목록", async () => {
    const s = await setup();
    await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 20, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    const [res] = await syncOfflineOps(
      db,
      s.trainer.userId,
      [
        op(
          {
            kind: "CREATE_BOOKING",
            payload: {
              studentId: s.studentId,
              startAt: kstDateTime(2026, 11, 20, 19, 30).toISOString(),
            },
          },
          T0,
        ),
      ],
      kstDateTime(2026, 11, 13, 12),
    );
    expect(res).toMatchObject({ status: "CONFLICT" });
    expect(await db.booking.count({ where: { studentId: s.studentId } })).toBe(
      1,
    );
  });

  it("현장 승인: 서버 PIN 검증 실패 시 승인 요청으로 남는다", async () => {
    const s = await setup();
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 16, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: r.created[0], accept: true },
      T0,
    );
    await runApprovalJobs(db, kstDateTime(2026, 11, 16, 20));
    const [bad] = await syncOfflineOps(
      db,
      s.trainer.userId,
      [
        op(
          {
            kind: "ONSITE_APPROVE",
            payload: { bookingId: r.created[0], pin: "0000" },
          },
          kstDateTime(2026, 11, 16, 20),
        ),
      ],
      kstDateTime(2026, 11, 16, 21),
    );
    expect(bad.status).toBe("PIN_FAILED");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: r.created[0] } }))
        .status,
    ).toBe("PENDING_APPROVAL");
    const [ok] = await syncOfflineOps(
      db,
      s.trainer.userId,
      [
        op(
          {
            kind: "ONSITE_APPROVE",
            payload: { bookingId: r.created[0], pin: "1357" },
          },
          kstDateTime(2026, 11, 16, 20),
        ),
      ],
      kstDateTime(2026, 11, 16, 21),
    );
    expect(ok.status).toBe("APPLIED");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: r.created[0] } }))
        .approvalMethod,
    ).toBe("PIN_ONSITE");
  });

  it("다른 트레이너의 예약은 동기화로도 바꿀 수 없다", async () => {
    const s = await setup();
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 20, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    const other = await makeUser("TRAINER");
    const base = new Date(Date.now() + 86400_000).toISOString();
    const [res] = await syncOfflineOps(
      db,
      other.userId,
      [
        op(
          {
            kind: "CANCEL_BOOKING",
            payload: { bookingId: r.created[0], baseUpdatedAt: base },
          },
          T0,
        ),
      ],
      kstDateTime(2026, 11, 13, 12),
    );
    expect(res.status).toBe("FAILED");
    await cancelByTrainer(
      db,
      { trainerId: s.trainer.userId, bookingId: r.created[0] },
      T0,
    );
  });
});
