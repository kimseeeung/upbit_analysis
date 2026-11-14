import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySecret } from "@/lib/auth/hash";
import { hashSessionToken } from "@/lib/auth/session-rules";
import { kstDateTime } from "@/lib/time";
import {
  ALL_CONSENTS,
  captureSms,
  resetDb,
  seedTerms,
  testDb,
} from "@/test/db-helpers";
import {
  changePassword,
  findLoginId,
  resetPassword,
  resetPin,
  sendFullLoginIdBySms,
} from "./account-service";
import { login } from "./login-service";
import {
  createSession,
  listActiveSessions,
  resolveSession,
  revokeAllSessions,
} from "./session-service";
import { signup, type SignupInput } from "./signup-service";
import { sendVerificationCode, verifyCode } from "./sms-service";
import { getTermsNeedingReconsent } from "./terms-service";
import { AppError } from "@/server/errors";

const db = testDb();
const T0 = kstDateTime(2026, 11, 13, 10, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const at = (ms: number) => new Date(T0.getTime() + ms);

async function verifiedPhone(
  phone: string,
  purpose: "SIGNUP" | "FIND_ID" | "RESET_PW" | "RESET_PIN" | "CHANGE_PHONE",
  now = T0,
) {
  const sms = captureSms();
  const { verificationId } = await sendVerificationCode(
    db,
    { phone, purpose },
    now,
  );
  await verifyCode(db, { verificationId, code: sms.lastCode() }, now);
  return verificationId;
}

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

let seq = 0;
async function makeUser(
  role: "TRAINER" | "STUDENT" | "CENTER_ADMIN",
  overrides: Partial<SignupInput> = {},
) {
  seq += 1;
  const phone = `0109000${String(seq).padStart(4, "0")}`;
  const loginId =
    overrides.loginId ?? `user${seq}${role.toLowerCase().slice(0, 1)}`;
  const verificationId = await verifiedPhone(phone, "SIGNUP");
  const input: SignupInput = {
    role,
    loginId,
    password: "abcd123!",
    passwordConfirm: "abcd123!",
    name: `사용자${seq}`,
    phone,
    verificationId,
    consents: ALL_CONSENTS,
    ...(role === "STUDENT"
      ? {
          pin: "1357",
          pinConfirm: "1357",
          trainer: { name: "미가입 트레이너" },
        }
      : {}),
    ...(role === "TRAINER"
      ? { workplace: { name: "강남 PT", address: "서울" } }
      : {}),
    ...(role === "CENTER_ADMIN"
      ? { center: { name: "센터A", address: "서울", phone: "0212345678" } }
      : {}),
    ...overrides,
  };
  const r = await signup(db, input, T0);
  return { ...r, loginId, phone, password: "abcd123!" };
}

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  seq = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("회원가입", () => {
  it("트레이너·수강생·센터 관리자 가입", async () => {
    const trainer = await makeUser("TRAINER");
    const student = await makeUser("STUDENT", {
      trainer: { trainerUserId: trainer.userId },
      birthDate: "1995-03-07",
      gender: "FEMALE",
    });
    const admin = await makeUser("CENTER_ADMIN", {
      center: {
        name: "인증센터",
        address: "부산",
        phone: "051-123-4567",
        bizNo: "123-45-67890",
      },
    });

    const s = await db.user.findUniqueOrThrow({
      where: { id: student.userId },
      include: { studentProfile: true, student: true },
    });
    expect(s.passwordHash).toMatch(/^pbkdf2-sha256\$600000\$/);
    expect(s.passwordHash).not.toContain("abcd123!");
    expect(
      await verifySecret("1357", {
        hash: s.studentProfile!.pinHash,
        salt: s.studentProfile!.pinSalt,
      }),
    ).toBe(true);
    expect(s.birthDate?.toISOString()).toBe("1995-03-06T15:00:00.000Z");
    const link = await db.linkRequest.findFirstOrThrow({
      where: { fromUserId: student.userId },
    });
    expect(link).toMatchObject({
      toUserId: trainer.userId,
      studentId: s.student!.id,
      status: "PENDING",
    });

    const center = await db.center.findFirstOrThrow({
      where: { name: "인증센터" },
    });
    expect(center).toMatchObject({
      verified: true,
      bizNo: "1234567890",
      phone: "0511234567",
    });
    expect(
      await db.centerAdmin.count({
        where: { userId: admin.userId, centerId: center.id },
      }),
    ).toBe(1);

    // 약관 동의 기록: 항목·버전·일시
    const consents = await db.termsConsent.findMany({
      where: { userId: student.userId },
    });
    expect(consents).toHaveLength(5);
    expect(consents.filter((c) => c.agreed)).toHaveLength(4);

    const audit = await db.auditLog.findMany({
      where: { action: "user.signup" },
    });
    expect(audit).toHaveLength(3);
  });

  it("트레이너가 가입한 센터를 고르면 소속 요청이 생긴다", async () => {
    const admin = await makeUser("CENTER_ADMIN");
    const center = await db.center.findFirstOrThrow({
      where: { admins: { some: { userId: admin.userId } } },
    });
    const t = await makeUser("TRAINER", { workplace: { centerId: center.id } });
    expect(
      await db.centerMembership.findFirst({ where: { trainerId: t.userId } }),
    ).toMatchObject({
      centerId: center.id,
      status: "PENDING",
    });
  });

  it("아이디는 유형과 관계없이 전체에서 중복 불가", async () => {
    await makeUser("TRAINER", { loginId: "same1" });
    await expectAppError(
      makeUser("STUDENT", { loginId: "same1" }),
      "LOGIN_ID_TAKEN",
    );
  });

  it("전화번호 하나에 계정 하나: 가입된 번호는 인증번호를 받을 수 없다", async () => {
    const t = await makeUser("TRAINER");
    await expectAppError(
      sendVerificationCode(db, { phone: t.phone, purpose: "SIGNUP" }, at(MIN)),
      "PHONE_TAKEN",
    );
  });

  it("본인인증 없이는 가입 불가, 인증 결과는 한 번만 쓴다", async () => {
    const phone = "01088887777";
    const verificationId = await verifiedPhone(phone, "SIGNUP");
    const base: SignupInput = {
      role: "TRAINER",
      loginId: "trainer1",
      password: "abcd123!",
      passwordConfirm: "abcd123!",
      name: "김트레",
      phone,
      verificationId,
      workplace: { name: "PT샵", address: "" },
      consents: ALL_CONSENTS,
    };
    await expectAppError(
      signup(db, { ...base, phone: "01011112222" }, T0),
      "VERIFICATION_REQUIRED",
    );
    await signup(db, base, T0);
    await expectAppError(
      signup(db, { ...base, loginId: "trainer2", phone }, T0),
      "VERIFICATION_REQUIRED",
    );
  });

  it("필수 약관 미동의면 가입되지 않고 인증 결과도 그대로 남는다", async () => {
    const phone = "01077776666";
    const verificationId = await verifiedPhone(phone, "SIGNUP");
    const input: SignupInput = {
      role: "TRAINER",
      loginId: "trainer9",
      password: "abcd123!",
      passwordConfirm: "abcd123!",
      name: "이트레",
      phone,
      verificationId,
      workplace: { name: "PT샵", address: "" },
      consents: { ...ALL_CONSENTS, THIRD_PARTY: false },
    };
    await expectAppError(signup(db, input, T0), "CONSENT_REQUIRED");
    expect(await db.user.count()).toBe(0);
    await signup(db, { ...input, consents: ALL_CONSENTS }, T0);
    expect(await db.user.count()).toBe(1);
  });

  it("수강생 PIN 정책: 생년월일 뒤 4자리 금지", async () => {
    await expectAppError(
      makeUser("STUDENT", {
        birthDate: "1990-09-18",
        pin: "0918",
        pinConfirm: "0918",
      }),
      "INVALID",
    );
  });
});

describe("SMS 본인인증", () => {
  it("30초 뒤부터 재발송, 하루 횟수 제한 없음", async () => {
    captureSms();
    const phone = "01055554444";
    await sendVerificationCode(db, { phone, purpose: "SIGNUP" }, T0);
    await expectAppError(
      sendVerificationCode(db, { phone, purpose: "SIGNUP" }, at(10_000)),
      "COOLDOWN",
    );
    // 하루 5회 제한은 없앴다 (2026-11-14): 여러 번 받아도 된다
    for (let i = 1; i <= 7; i++) {
      await sendVerificationCode(db, { phone, purpose: "SIGNUP" }, at(i * MIN));
    }
  });

  it("테스트 모드(문자 업체 연결 전): 000000이면 만료·틀린 횟수와 관계없이 통과", async () => {
    vi.stubEnv("SMS_FIXED_CODE", "");
    vi.stubEnv("SMS_PROVIDER", "console");
    try {
      captureSms();
      const phone = "01055551111";
      const { verificationId, testCode } = await sendVerificationCode(
        db,
        { phone, purpose: "SIGNUP" },
        T0,
      );
      expect(testCode).toBe("000000");
      for (let i = 0; i < 6; i++)
        await expectAppError(
          verifyCode(db, { verificationId, code: "123456" }, at(i * 1000)),
          i < 4 ? "WRONG_CODE" : "TOO_MANY",
        );
      // 3분이 지나고 5회 넘게 틀렸어도 000000은 통과
      await expect(
        verifyCode(db, { verificationId, code: "000000" }, at(10 * MIN)),
      ).resolves.toMatchObject({ phone });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("3분이 지나면 만료, 5회 틀리면 새 번호를 받아야 한다", async () => {
    const sms = captureSms();
    const phone = "01055553333";
    const a = await sendVerificationCode(db, { phone, purpose: "SIGNUP" }, T0);
    await expectAppError(
      verifyCode(
        db,
        { verificationId: a.verificationId, code: sms.lastCode() },
        at(3 * MIN),
      ),
      "EXPIRED",
    );

    const b = await sendVerificationCode(
      db,
      { phone, purpose: "SIGNUP" },
      at(4 * MIN),
    );
    const code = sms.lastCode();
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 4; i++) {
      await expectAppError(
        verifyCode(
          db,
          { verificationId: b.verificationId, code: wrong },
          at(4 * MIN),
        ),
        "WRONG_CODE",
      );
    }
    await expectAppError(
      verifyCode(
        db,
        { verificationId: b.verificationId, code: wrong },
        at(4 * MIN),
      ),
      "TOO_MANY",
    );
    await expectAppError(
      verifyCode(db, { verificationId: b.verificationId, code }, at(4 * MIN)),
      "TOO_MANY",
    );
  });

  it("인증번호는 해시로만 저장한다", async () => {
    const sms = captureSms();
    await sendVerificationCode(
      db,
      { phone: "01055552222", purpose: "SIGNUP" },
      T0,
    );
    const row = await db.smsVerification.findFirstOrThrow();
    expect(row.codeHash).not.toContain(sms.lastCode());
    expect(row.codeHash).toMatch(/^pbkdf2-sha256\$/);
  });
});

describe("로그인 5회 실패 잠금", () => {
  it("5회 연속 실패하면 10분 잠기고, 맞는 비밀번호도 거부한다", async () => {
    const u = await makeUser("TRAINER");
    const attempt = (password: string, now: Date) =>
      login(
        db,
        {
          role: "TRAINER",
          loginId: u.loginId,
          password,
          remember: false,
          deviceLabel: "test",
        },
        now,
      );

    for (let i = 0; i < 4; i++)
      await expectAppError(attempt("wrong123!", at(i * 1000)), "LOGIN_FAILED");
    await expectAppError(attempt("wrong123!", at(5000)), "LOCKED");
    await expectAppError(attempt(u.password, at(6000)), "LOCKED");
    await expectAppError(
      attempt(u.password, at(5000 + 10 * MIN - 1)),
      "LOCKED",
    );

    const ok = await attempt(u.password, at(5000 + 10 * MIN));
    expect(ok.userId).toBe(u.userId);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(after).toMatchObject({ loginFailCount: 0, lockedUntil: null });
    expect(
      await db.auditLog.count({ where: { action: "user.loginLocked" } }),
    ).toBe(1);
  });

  it("성공하면 실패 횟수가 초기화된다 (연속 실패만 센다)", async () => {
    const u = await makeUser("STUDENT");
    const attempt = (password: string, now: Date) =>
      login(
        db,
        {
          role: "STUDENT",
          loginId: u.loginId,
          password,
          remember: false,
          deviceLabel: "t",
        },
        now,
      );
    for (let i = 0; i < 4; i++)
      await expectAppError(attempt("x", T0), "LOGIN_FAILED");
    await attempt(u.password, T0);
    for (let i = 0; i < 4; i++)
      await expectAppError(attempt("x", T0), "LOGIN_FAILED");
    await attempt(u.password, T0);
  });

  it("유형을 잘못 고르거나 없는 아이디도 같은 문구", async () => {
    const u = await makeUser("TRAINER");
    const wrongRole = login(
      db,
      {
        role: "STUDENT",
        loginId: u.loginId,
        password: u.password,
        remember: false,
        deviceLabel: "t",
      },
      T0,
    );
    await expect(wrongRole).rejects.toThrow(
      "아이디 또는 비밀번호가 맞지 않습니다",
    );
    const noUser = login(
      db,
      {
        role: "TRAINER",
        loginId: "nobody",
        password: "x",
        remember: false,
        deviceLabel: "t",
      },
      T0,
    );
    await expect(noUser).rejects.toThrow(
      "아이디 또는 비밀번호가 맞지 않습니다",
    );
  });
});

describe("세션 30일 슬라이딩", () => {
  it("접속할 때마다 30일로 연장, 30일 미접속이면 만료", async () => {
    const u = await makeUser("TRAINER");
    const s = await createSession(
      db,
      { userId: u.userId, persistent: true, deviceLabel: "iPhone" },
      T0,
    );
    const tokenHash = hashSessionToken(s.token);
    expect(s.expiresAt).toEqual(at(30 * DAY));

    expect(await resolveSession(db, s.token, at(20 * DAY))).not.toBeNull();
    expect(
      (await db.session.findUniqueOrThrow({ where: { tokenHash } })).expiresAt,
    ).toEqual(at(50 * DAY));

    expect(await resolveSession(db, s.token, at(49 * DAY))).not.toBeNull();
    expect(
      (await db.session.findUniqueOrThrow({ where: { tokenHash } })).expiresAt,
    ).toEqual(at(79 * DAY));

    expect(await resolveSession(db, s.token, at(79 * DAY))).toBeNull();
    expect(await resolveSession(db, s.token, at(80 * DAY))).toBeNull();
  });

  it("토큰은 해시로만 저장한다", async () => {
    const u = await makeUser("TRAINER");
    const s = await createSession(
      db,
      { userId: u.userId, persistent: true, deviceLabel: "x" },
      T0,
    );
    const rows = await db.session.findMany();
    expect(JSON.stringify(rows)).not.toContain(s.token);
  });

  it("로그인 기기 목록과 모든 기기 로그아웃", async () => {
    const u = await makeUser("STUDENT");
    const a = await createSession(
      db,
      { userId: u.userId, persistent: true, deviceLabel: "iPhone · Safari" },
      T0,
    );
    await createSession(
      db,
      { userId: u.userId, persistent: false, deviceLabel: "Windows · Chrome" },
      at(MIN),
    );
    const list = await listActiveSessions(db, u.userId, at(2 * MIN));
    expect(list.map((x) => x.deviceLabel)).toEqual([
      "Windows · Chrome",
      "iPhone · Safari",
    ]);
    await revokeAllSessions(db, u.userId, {}, at(3 * MIN));
    expect(await listActiveSessions(db, u.userId, at(4 * MIN))).toHaveLength(0);
    expect(await resolveSession(db, a.token, at(4 * MIN))).toBeNull();
  });
});

describe("계정 관리", () => {
  it("아이디 찾기: 마스킹 + 가입일, 전체 아이디는 문자로", async () => {
    const u = await makeUser("TRAINER", { loginId: "kimtrainer" });
    const verificationId = await verifiedPhone(u.phone, "FIND_ID", at(MIN));
    const r = await findLoginId(
      db,
      { role: "TRAINER", name: "사용자1", phone: u.phone, verificationId },
      at(MIN),
    );
    expect(r.maskedLoginId).toBe("kim***");
    expect(r.joinedAt).toEqual(T0);
    await expectAppError(
      findLoginId(
        db,
        { role: "STUDENT", name: "사용자1", phone: u.phone, verificationId },
        at(MIN),
      ),
      "NOT_FOUND",
    );
    const sms = captureSms();
    await sendFullLoginIdBySms(
      db,
      { role: "TRAINER", name: "사용자1", phone: u.phone, verificationId },
      at(MIN),
    );
    expect(sms.sent.at(-1)?.text).toContain("kimtrainer");
  });

  it("비밀번호 재설정: 직전 비밀번호 금지, 모든 기기 로그아웃, 잠금 해제", async () => {
    const u = await makeUser("TRAINER");
    const s = await createSession(
      db,
      { userId: u.userId, persistent: true, deviceLabel: "x" },
      T0,
    );
    await db.user.update({
      where: { id: u.userId },
      data: { loginFailCount: 5, lockedUntil: at(10 * MIN) },
    });

    const v1 = await verifiedPhone(u.phone, "RESET_PW", at(MIN));
    await expectAppError(
      resetPassword(
        db,
        {
          loginId: u.loginId,
          phone: u.phone,
          verificationId: v1,
          newPassword: u.password,
          newPasswordConfirm: u.password,
        },
        at(MIN),
      ),
      "SAME_PASSWORD",
    );
    await resetPassword(
      db,
      {
        loginId: u.loginId,
        phone: u.phone,
        verificationId: v1,
        newPassword: "newpass9@",
        newPasswordConfirm: "newpass9@",
      },
      at(MIN),
    );
    expect(await resolveSession(db, s.token, at(2 * MIN))).toBeNull();
    const ok = await login(
      db,
      {
        role: "TRAINER",
        loginId: u.loginId,
        password: "newpass9@",
        remember: false,
        deviceLabel: "x",
      },
      at(2 * MIN),
    );
    expect(ok.userId).toBe(u.userId);
  });

  it("비밀번호 변경: 현재 기기는 유지, 다른 기기는 로그아웃", async () => {
    const u = await makeUser("STUDENT");
    const here = await createSession(
      db,
      { userId: u.userId, persistent: true, deviceLabel: "here" },
      T0,
    );
    const other = await createSession(
      db,
      { userId: u.userId, persistent: true, deviceLabel: "other" },
      T0,
    );
    await expectAppError(
      changePassword(
        db,
        {
          userId: u.userId,
          currentSessionId: here.sessionId,
          currentPassword: "wrong",
          newPassword: "newpass9@",
          newPasswordConfirm: "newpass9@",
        },
        at(MIN),
      ),
      "WRONG_PASSWORD",
    );
    await changePassword(
      db,
      {
        userId: u.userId,
        currentSessionId: here.sessionId,
        currentPassword: u.password,
        newPassword: "newpass9@",
        newPasswordConfirm: "newpass9@",
      },
      at(MIN),
    );
    expect(await resolveSession(db, here.token, at(2 * MIN))).not.toBeNull();
    expect(await resolveSession(db, other.token, at(2 * MIN))).toBeNull();
  });

  it("PIN 재설정: 본인인증 후, 잠금도 풀린다", async () => {
    const u = await makeUser("STUDENT");
    await db.studentProfile.update({
      where: { userId: u.userId },
      data: {
        pinFailCount: 5,
        pinLockedUntil: new Date("9999-12-31T00:00:00Z"),
      },
    });
    const v = await verifiedPhone(u.phone, "RESET_PIN", at(MIN));
    await expectAppError(
      resetPin(
        db,
        {
          userId: u.userId,
          verificationId: v,
          pin: "1234",
          pinConfirm: "1234",
        },
        at(MIN),
      ),
      "INVALID",
    );
    await resetPin(
      db,
      { userId: u.userId, verificationId: v, pin: "2580", pinConfirm: "2580" },
      at(MIN),
    );
    const p = await db.studentProfile.findUniqueOrThrow({
      where: { userId: u.userId },
    });
    expect(p).toMatchObject({ pinFailCount: 0, pinLockedUntil: null });
    expect(
      await verifySecret("2580", { hash: p.pinHash, salt: p.pinSalt }),
    ).toBe(true);
  });
});

describe("약관 재동의", () => {
  it("새 버전이 시행되면 필수 약관 재동의가 필요하다", async () => {
    const u = await makeUser("TRAINER");
    expect(await getTermsNeedingReconsent(db, u.userId, at(MIN))).toHaveLength(
      0,
    );
    await seedTerms(db, "v2", at(7 * DAY));
    expect(
      await getTermsNeedingReconsent(db, u.userId, at(6 * DAY)),
    ).toHaveLength(0);
    const pending = await getTermsNeedingReconsent(db, u.userId, at(7 * DAY));
    expect(pending.map((t) => t.kind)).toEqual([
      "SERVICE",
      "PRIVACY",
      "THIRD_PARTY",
      "NOTIFY",
    ]);
  });
});
