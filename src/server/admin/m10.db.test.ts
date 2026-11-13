import { randomBytes, randomInt } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { validateRollbackPin } from "@/lib/admin/rules";
import { login } from "@/server/auth/login-service";
import { resolveSession } from "@/server/auth/session-service";
import { captureSms, resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import { setDeployAdapterForTest } from "./deploy-adapter";
import {
  getMemberDetail,
  searchMembers,
  setMemberSuspended,
} from "./member-admin-service";
import {
  answerInquiry,
  createInquiry,
  listMyInquiries,
} from "./notice-service";
import {
  bootstrapFirstOperator,
  operatorLoginStart,
  operatorLoginVerify,
  resolveOperatorSession,
} from "./operator-auth";
import {
  acceptInvite,
  disableOperator,
  inviteOperator,
  listAlerts,
  sendInviteCode,
} from "./operator-service";
import {
  getMaintenance,
  registerCurrentVersion,
  rollback,
  verifyRollbackPin,
} from "./version-service";
import { verifyCode } from "@/server/auth/sms-service";

const db = testDb();
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

/** 테스트마다 새로 만드는 값 (비밀값을 코드에 적지 않음) */
function secrets() {
  let pin = "";
  do pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  while (!validateRollbackPin(pin).ok);
  return { password: `Op${randomBytes(4).toString("hex")}!9`, pin };
}

let phoneSeq = 0;
async function makeOperator(loginId = `op${++phoneSeq}admin`) {
  const s = secrets();
  const env = {
    OPERATOR_INIT_LOGIN_ID: loginId,
    OPERATOR_INIT_PASSWORD: s.password,
    OPERATOR_INIT_ROLLBACK_PIN: s.pin,
    OPERATOR_INIT_NAME: "운영자",
    OPERATOR_INIT_PHONE: `0107700${String(phoneSeq).padStart(4, "0")}`,
  };
  expect(await bootstrapFirstOperator(db, env, T0)).toBe("created");
  const op = await db.operatorAccount.findUniqueOrThrow({ where: { loginId } });
  return { op, ...s, loginId };
}

/** 초대 → 수락으로 관리자 한 명 더 */
async function addOperator(byId: string, name: string) {
  const sms = captureSms();
  const phone = `0107800${String(++phoneSeq).padStart(4, "0")}`;
  const { operatorId, token } = await inviteOperator(
    db,
    byId,
    { name, phone },
    T0,
  );
  const sent = await sendInviteCode(db, token, T0);
  expect(sms.sent.at(-1)?.to).toBe(phone);
  await verifyCode(
    db,
    { verificationId: sent.verificationId, code: sms.lastCode() },
    T0,
  );
  const s = secrets();
  const loginId = `op${phoneSeq}invited`;
  await acceptInvite(
    db,
    token,
    {
      loginId,
      password: s.password,
      rollbackPin: s.pin,
      verificationId: sent.verificationId,
    },
    T0,
  );
  return { operatorId, loginId, ...s };
}

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
  setDeployAdapterForTest(null);
});
afterAll(async () => {
  await db.$disconnect();
});

describe("첫 관리자 (12.1)", () => {
  it("환경 변수가 모두 있을 때 한 번만 만들고, 비밀값은 PBKDF2 해시로만 저장", async () => {
    expect(await bootstrapFirstOperator(db, {}, T0)).toBe("skipped");
    const { op, password, pin } = await makeOperator();
    expect(op.status).toBe("ACTIVE");
    expect(op.passwordHash).toMatch(/^pbkdf2-sha256\$600000\$/);
    expect(op.rollbackPinHash).toMatch(/^pbkdf2-sha256\$600000\$/);
    const row = JSON.stringify(op);
    expect(row).not.toContain(password);
    expect(row).not.toContain(`"${pin}"`);
    expect(
      await bootstrapFirstOperator(db, { OPERATOR_INIT_LOGIN_ID: "x" }, T0),
    ).toBe("exists");
    const audit = await db.auditLog.findMany({
      where: { entity: "OperatorAccount" },
    });
    expect(JSON.stringify(audit)).not.toContain(password);
  });
});

describe("2단계 로그인 (12.1)", () => {
  it("비밀번호 → 휴대폰 인증 → 30분 세션, 5회 실패하면 30분 잠금", async () => {
    const sms = captureSms();
    const { op, password, loginId } = await makeOperator();
    const step1 = await operatorLoginStart(db, { loginId, password }, T0);
    expect(sms.sent.at(-1)?.to).toBe(op.phone);
    const { token } = await operatorLoginVerify(
      db,
      {
        challengeToken: step1.challengeToken,
        code: sms.lastCode(),
        ip: "203.0.113.1",
      },
      T0,
    );
    expect((await resolveOperatorSession(db, token, min(29)))?.operatorId).toBe(
      op.id,
    );
    // 같은 2단계 토큰은 다시 쓸 수 없음
    await expect(
      operatorLoginVerify(
        db,
        { challengeToken: step1.challengeToken, code: sms.lastCode() },
        T0,
      ),
    ).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    // 30분 동안 쓰지 않으면 끝 (29분에 한 번 써서 59분까지 연장)
    expect(await resolveOperatorSession(db, token, min(58))).not.toBeNull();
    expect(await resolveOperatorSession(db, token, min(90))).toBeNull();

    for (let i = 0; i < 4; i++)
      await expect(
        operatorLoginStart(db, { loginId, password: "wrong-pass1!" }, min(100)),
      ).rejects.toMatchObject({ code: "LOGIN_FAILED" });
    await expect(
      operatorLoginStart(db, { loginId, password: "wrong-pass1!" }, min(100)),
    ).rejects.toMatchObject({ code: "LOCKED" });
    // 맞는 비밀번호도 30분 동안 거부
    await expect(
      operatorLoginStart(db, { loginId, password }, min(129)),
    ).rejects.toMatchObject({
      code: "LOCKED",
    });
    await expect(
      operatorLoginStart(db, { loginId, password }, min(131)),
    ).resolves.toBeTruthy();
  });

  it("인증번호 오류도 실패로 센다", async () => {
    captureSms();
    const { password, loginId, op } = await makeOperator();
    const step1 = await operatorLoginStart(db, { loginId, password }, T0);
    await expect(
      operatorLoginVerify(
        db,
        { challengeToken: step1.challengeToken, code: "000000" },
        T0,
      ),
    ).rejects.toBeTruthy();
    expect(
      (await db.operatorAccount.findUniqueOrThrow({ where: { id: op.id } }))
        .failCount,
    ).toBe(1);
  });
});

describe("롤백 PIN 잠금 (M10 완료 기준)", () => {
  it("5회 틀리면 30분 동안 맞는 PIN도 거부, 30분 뒤 다시 가능", async () => {
    const { op, pin } = await makeOperator();
    const wrong = pin === "135790" ? "246802" : "135790";
    for (let i = 1; i <= 4; i++)
      await expect(
        verifyRollbackPin(db, op.id, wrong, T0),
      ).rejects.toMatchObject({
        code: "WRONG_PIN",
        message: `롤백 PIN이 맞지 않습니다 (남은 횟수 ${5 - i}회)`,
      });
    await expect(verifyRollbackPin(db, op.id, wrong, T0)).rejects.toMatchObject(
      { code: "PIN_LOCKED" },
    );
    await expect(
      verifyRollbackPin(db, op.id, pin, min(29)),
    ).rejects.toMatchObject({
      code: "PIN_LOCKED",
    });
    await expect(
      verifyRollbackPin(db, op.id, pin, min(30)),
    ).resolves.toBeUndefined();
    const after = await db.operatorAccount.findUniqueOrThrow({
      where: { id: op.id },
    });
    expect(after.rollbackPinFailCount).toBe(0);
    expect(after.rollbackLockedUntil).toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: "operator.rollbackPinLocked" },
      }),
    ).toBe(1);
  });

  it("잠긴 동안에는 롤백이 실행되지 않는다", async () => {
    const { op, pin } = await makeOperator();
    await registerCurrentVersion(db, { version: "1.0.0" }, min(-60));
    await registerCurrentVersion(db, { version: "1.1.0" }, min(-30));
    await db.operatorAccount.update({
      where: { id: op.id },
      data: { rollbackPinFailCount: 5, rollbackLockedUntil: min(30) },
    });
    await expect(
      rollback(
        db,
        op.id,
        { toVersion: "1.0.0", pin, reason: "로그인 오류" },
        {},
        () => T0,
      ),
    ).rejects.toMatchObject({ code: "PIN_LOCKED" });
    expect(await db.rollbackLog.count()).toBe(0);
  });
});

describe("관리자 최소 1명 유지 (M10 완료 기준)", () => {
  it("혼자 남은 활성 관리자는 자기 자신도 비활성화할 수 없다", async () => {
    const { op } = await makeOperator();
    await expect(disableOperator(db, op.id, op.id, T0)).rejects.toMatchObject({
      code: "LAST_OPERATOR",
    });
    // 초대 대기는 세지 않는다
    await inviteOperator(
      db,
      op.id,
      { name: "대기자", phone: "01077770001" },
      T0,
    );
    await expect(disableOperator(db, op.id, op.id, T0)).rejects.toMatchObject({
      code: "LAST_OPERATOR",
    });
  });

  it("두 명 중 한 명은 비활성화 가능, 그러면 남은 한 명은 불가. 세션도 끝난다", async () => {
    const { op } = await makeOperator();
    const b = await addOperator(op.id, "둘째");
    // 활성화 알림이 첫 관리자에게
    expect(
      (await listAlerts(db, op.id)).map((a) => a.message).join(),
    ).toContain("둘째");
    await db.operatorSession.create({
      data: { tokenHash: "x", operatorId: b.operatorId, expiresAt: min(30) },
    });
    await disableOperator(db, op.id, b.operatorId, T0);
    expect(
      await db.operatorSession.count({
        where: { operatorId: b.operatorId, revokedAt: null },
      }),
    ).toBe(0);
    await expect(
      disableOperator(db, b.operatorId, op.id, T0),
    ).rejects.toMatchObject({
      code: "LAST_OPERATOR",
    });
    expect(
      await db.auditLog.count({ where: { action: "operator.disable" } }),
    ).toBe(1);
  });

  it("두 명이 서로를 동시에 비활성화해도 한 명은 남는다", async () => {
    const { op } = await makeOperator();
    const b = await addOperator(op.id, "둘째");
    const r = await Promise.allSettled([
      disableOperator(db, op.id, b.operatorId, T0),
      disableOperator(db, b.operatorId, op.id, T0),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.operatorAccount.count({ where: { status: "ACTIVE" } }),
    ).toBe(1);
  });
});

describe("초대 (12.2)", () => {
  it("초대받은 번호로만 인증, 약한 PIN·중복 아이디 거부, 링크는 한 번만", async () => {
    const sms = captureSms();
    const { op, loginId: firstId } = await makeOperator();
    const { token } = await inviteOperator(
      db,
      op.id,
      { name: "새 관리자", phone: "010-7777-0002" },
      T0,
    );
    const sent = await sendInviteCode(db, token, T0);
    expect(sms.sent.at(-1)?.to).toBe("01077770002");
    await verifyCode(
      db,
      { verificationId: sent.verificationId, code: sms.lastCode() },
      T0,
    );
    const s = secrets();
    await expect(
      acceptInvite(
        db,
        token,
        {
          loginId: "newop1",
          password: s.password,
          rollbackPin: "123456",
          verificationId: sent.verificationId,
        },
        T0,
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      acceptInvite(
        db,
        token,
        {
          loginId: firstId,
          password: s.password,
          rollbackPin: s.pin,
          verificationId: sent.verificationId,
        },
        T0,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_ID_TAKEN" });
    await acceptInvite(
      db,
      token,
      {
        loginId: "newop1",
        password: s.password,
        rollbackPin: s.pin,
        verificationId: sent.verificationId,
      },
      T0,
    );
    expect(
      (
        await db.operatorAccount.findUniqueOrThrow({
          where: { loginId: "newop1" },
        })
      ).status,
    ).toBe("ACTIVE");
    await expect(
      acceptInvite(
        db,
        token,
        {
          loginId: "newop2",
          password: s.password,
          rollbackPin: s.pin,
          verificationId: sent.verificationId,
        },
        T0,
      ),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });
});

describe("롤백 (12.3)", () => {
  it("점검 중 표시 → 재배포 → 점검 결과 기록 → 다시 최신으로", async () => {
    const { op, pin } = await makeOperator();
    await registerCurrentVersion(
      db,
      { version: "1.0.0", summary: "첫 배포" },
      min(-60),
    );
    await registerCurrentVersion(
      db,
      { version: "1.1.0", summary: "알림 개선" },
      min(-30),
    );
    const deployed: string[] = [];
    let maintenanceDuringDeploy = false;
    const adapter = {
      name: "test",
      async deploy(v: string) {
        deployed.push(v);
        maintenanceDuringDeploy = (await getMaintenance(db)).on;
      },
    };
    const log = await rollback(
      db,
      op.id,
      { toVersion: "1.0.0", pin, reason: "로그인 오류" },
      { adapter, healthCheck: async () => [{ name: "로그인", ok: true }] },
      () => T0,
    );
    expect(deployed).toEqual(["1.0.0"]);
    expect(maintenanceDuringDeploy).toBe(true);
    expect((await getMaintenance(db)).on).toBe(false);
    expect(log).toMatchObject({
      fromVersion: "1.1.0",
      toVersion: "1.0.0",
      result: "SUCCEEDED",
      reason: "로그인 오류",
    });
    expect(
      (await db.deployVersion.findFirstOrThrow({ where: { isCurrent: true } }))
        .version,
    ).toBe("1.0.0");
    // 이전 버전이 다시 떠도 기록은 하나 (지금 버전 표시만)
    await registerCurrentVersion(db, { version: "1.0.0" }, min(1));
    expect(await db.deployVersion.count()).toBe(2);

    const back = await rollback(
      db,
      op.id,
      { toVersion: "1.1.0", pin, reason: "수정 확인" },
      {
        adapter,
        healthCheck: async () => [{ name: "로그인", ok: false, detail: "500" }],
      },
      () => min(5),
    );
    expect(back.result).toBe("FAILED");
    expect(
      (await db.deployVersion.findFirstOrThrow({ where: { isCurrent: true } }))
        .version,
    ).toBe("1.1.0");
    await expect(
      rollback(
        db,
        op.id,
        { toVersion: "1.1.0", pin, reason: "x2" },
        { adapter },
        () => min(6),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });
  });

  it("재배포가 실패하면 지금 버전은 그대로, 실패 기록", async () => {
    const { op, pin } = await makeOperator();
    await registerCurrentVersion(db, { version: "1.0.0" }, min(-60));
    await registerCurrentVersion(db, { version: "1.1.0" }, min(-30));
    const log = await rollback(
      db,
      op.id,
      { toVersion: "1.0.0", pin, reason: "테스트" },
      {
        adapter: {
          name: "bad",
          deploy: async () => {
            throw new Error("플랫폼 응답 없음");
          },
        },
      },
      () => T0,
    );
    expect(log).toMatchObject({ result: "FAILED", error: "플랫폼 응답 없음" });
    expect(
      (await db.deployVersion.findFirstOrThrow({ where: { isCurrent: true } }))
        .version,
    ).toBe("1.1.0");
    expect((await getMaintenance(db)).on).toBe(false);
  });
});

describe("회원 조회·정지 (12.4)", () => {
  it("목록은 가린 값, 상세를 열 때마다 조회 기록, 정지하면 로그인·세션 차단", async () => {
    const { op } = await makeOperator();
    const u = await makeUser("TRAINER", { name: "홍길동" });
    const list = await searchMembers(db, "홍길동");
    expect(list[0]).toMatchObject({ name: "홍*동" });
    expect(list[0].phone).toContain("****");
    await getMemberDetail(db, op.id, u.userId, T0);
    await getMemberDetail(db, op.id, u.userId, min(1));
    expect(
      await db.operatorAccessLog.count({
        where: { targetUserId: u.userId, action: "VIEW" },
      }),
    ).toBe(2);

    const s = await login(
      db,
      {
        role: "TRAINER",
        loginId: u.loginId,
        password: u.password,
        remember: false,
        deviceLabel: "x",
      },
      T0,
    );
    await setMemberSuspended(
      db,
      op.id,
      u.userId,
      { suspend: true, reason: "부정 이용" },
      T0,
    );
    expect(await resolveSession(db, s.token, T0)).toBeNull();
    await expect(
      login(
        db,
        {
          role: "TRAINER",
          loginId: u.loginId,
          password: u.password,
          remember: false,
          deviceLabel: "x",
        },
        T0,
      ),
    ).rejects.toMatchObject({ code: "SUSPENDED" });
    await setMemberSuspended(db, op.id, u.userId, { suspend: false }, T0);
    await expect(
      login(
        db,
        {
          role: "TRAINER",
          loginId: u.loginId,
          password: u.password,
          remember: false,
          deviceLabel: "x",
        },
        T0,
      ),
    ).resolves.toBeTruthy();
    expect(
      await db.auditLog.count({
        where: { action: { in: ["user.suspend", "user.unsuspend"] } },
      }),
    ).toBe(2);
  });
});

describe("문의 (12.4)", () => {
  it("회원 문의 → 관리자 답변 → 회원에게 알림", async () => {
    const { op } = await makeOperator();
    const u = await makeUser("STUDENT");
    const q = await createInquiry(
      db,
      u.userId,
      { title: "환불 문의", body: "이용권 환불 가능한가요?" },
      T0,
    );
    await answerInquiry(db, op.id, q.id, "트레이너와 상의해 주세요", min(10));
    const [mine] = await listMyInquiries(db, u.userId);
    expect(mine.answer).toBe("트레이너와 상의해 주세요");
    expect(
      await db.notification.count({
        where: { userId: u.userId, type: "INQUIRY_ANSWERED" },
      }),
    ).toBe(1);
  });
});
