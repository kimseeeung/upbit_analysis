/**
 * 임시 테스트 계정 만들기 (npm run accounts:test 가 서버 DB에 연결해 실행).
 * 트레이너 tr001~tr003, 수강생 st001~st003 (비밀번호는 사용자가 정한 값, 가입 비밀번호 규칙 예외).
 * 수강생은 같은 번호 트레이너와 연결, 이용권 10회, 수강 규칙 동의, 트레이너 근무 시간 월~토 09~21시.
 * 이미 있는 아이디는 건너뛴다. 정식 운영 전에는 이 계정들을 지우거나 비밀번호를 바꾼다.
 */
import "dotenv/config";
import { hashSecret } from "@/lib/auth/hash";
import { getDb } from "@/lib/db";
import { toKstDateKey } from "@/lib/time";
import { signup } from "@/server/auth/signup-service";
import { sendVerificationCode, verifyCode } from "@/server/auth/sms-service";
import { saveAvailability } from "@/server/bookings/availability-settings";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { setSmsSenderForTest } from "@/server/sms/sender";
import { respondLinkRequest } from "@/server/students/student-service";
import { ensureDefaultTerms } from "@/server/terms-defaults";

const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD ?? "12345!";
/** 가입 절차를 통과하기 위한 임시 비밀번호 (가입 직후 위 비밀번호로 바꿈) */
const SIGNUP_PASSWORD = "Tmp#2026setup";
const CONSENTS = {
  SERVICE: true,
  PRIVACY: true,
  THIRD_PARTY: true,
  NOTIFY: true,
  MARKETING: false,
};
const NAMES = {
  trainer: ["김코치", "이코치", "박코치"],
  student: ["최수강", "정수강", "강수강"],
};

async function main() {
  const db = getDb();
  await ensureDefaultTerms(db);
  let lastCode = "";
  setSmsSenderForTest({
    name: "test-accounts",
    async send(_to, text) {
      lastCode = /\[(\d{6})\]/.exec(text)?.[1] ?? "";
    },
  });
  const verified = async (phone: string) => {
    const { verificationId } = await sendVerificationCode(db, {
      phone,
      purpose: "SIGNUP",
    });
    await verifyCode(db, { verificationId, code: lastCode });
    return verificationId;
  };
  const hashed = await hashSecret(PASSWORD);
  const setPassword = (userId: string) =>
    db.user.update({
      where: { id: userId },
      data: { passwordHash: hashed.hash, passwordSalt: hashed.salt },
    });

  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const n = String(i).padStart(3, "0");
    const trainerId = `tr${n}`;
    const studentId = `st${n}`;

    // 트레이너
    let trainer = await db.user.findUnique({ where: { loginId: trainerId } });
    if (!trainer) {
      const phone = `0109990${n}1`.slice(0, 11);
      const r = await signup(db, {
        role: "TRAINER",
        loginId: trainerId,
        password: SIGNUP_PASSWORD,
        passwordConfirm: SIGNUP_PASSWORD,
        name: NAMES.trainer[i - 1],
        phone,
        verificationId: await verified(phone),
        consents: CONSENTS,
        workplace: { name: "머슬 강남점", address: "서울 강남구" },
      });
      await setPassword(r.userId);
      await saveAvailability(db, r.userId, {
        rules: [1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startTime: "09:00",
          endTime: "21:00",
        })),
        exceptions: [],
      });
      trainer = await db.user.findUniqueOrThrow({ where: { id: r.userId } });
      console.log(`✅ 트레이너 ${trainerId} (${trainer.name})`);
    } else console.log(`· 트레이너 ${trainerId} 이미 있음`);

    // 수강생 + 연결·이용권·규칙 동의
    if (await db.user.findUnique({ where: { loginId: studentId } })) {
      console.log(`· 수강생 ${studentId} 이미 있음`);
      continue;
    }
    const phone = `0109990${n}2`.slice(0, 11);
    const s = await signup(db, {
      role: "STUDENT",
      loginId: studentId,
      password: SIGNUP_PASSWORD,
      passwordConfirm: SIGNUP_PASSWORD,
      name: NAMES.student[i - 1],
      phone,
      verificationId: await verified(phone),
      consents: CONSENTS,
      pin: "1357",
      pinConfirm: "1357",
      trainer: { trainerUserId: trainer.id },
    });
    await setPassword(s.userId);
    const req = await db.linkRequest.findFirstOrThrow({
      where: { fromUserId: s.userId },
    });
    await respondLinkRequest(db, {
      userId: trainer.id,
      requestId: req.id,
      accept: true,
    });
    const st = await db.student.findUniqueOrThrow({
      where: { userId: s.userId },
    });
    const pass = await createPass(db, trainer.id, st.id, {
      name: "PT 10회",
      count: 10,
      startDate: toKstDateKey(now),
      endDate: toKstDateKey(new Date(now.getTime() + 180 * 86400_000)),
    });
    const c = await db.ruleConsent.findFirstOrThrow({
      where: { passId: pass.id },
    });
    await respondRuleConsent(db, {
      studentUserId: s.userId,
      consentId: c.id,
      action: "AGREE",
    });
    console.log(
      `✅ 수강생 ${studentId} (${NAMES.student[i - 1]}) → 트레이너 ${trainerId}, 이용권 10회, PIN 1357`,
    );
  }
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
