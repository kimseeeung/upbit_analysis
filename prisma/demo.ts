/**
 * 개발용 체험 계정 만들기: npm run db:demo
 * - 트레이너 trainer1 / 수강생 student1 (비밀번호 test1234!, 수강생 수업 승인 PIN 1357)
 * - 연결, 이용권 10회, 규칙 동의, 근무 시간, 앞으로 1주일 예약 5건(3건 확정)
 * 운영 DB에서는 실행되지 않는다. 운영 관리자 계정은 만들지 않는다.
 */
import "dotenv/config";
import { kstDateTime, toKstDateKey } from "@/lib/time";
import { getDb } from "@/lib/db";
import { signup } from "@/server/auth/signup-service";
import { sendVerificationCode, verifyCode } from "@/server/auth/sms-service";
import {
  createBookingsByTrainer,
  respondConfirmRequest,
} from "@/server/bookings/booking-service";
import { saveAvailability } from "@/server/bookings/availability-settings";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { setSmsSenderForTest } from "@/server/sms/sender";

const PASSWORD = "test1234!";
const CONSENTS = {
  SERVICE: true,
  PRIVACY: true,
  THIRD_PARTY: true,
  NOTIFY: true,
  MARKETING: false,
};

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.APP_VERSION) {
    throw new Error("운영 환경에서는 체험 계정을 만들지 않습니다");
  }
  const db = getDb();
  if (await db.user.findUnique({ where: { loginId: "trainer1" } })) {
    console.log(
      "체험 계정이 이미 있습니다: trainer1 / student1 (비밀번호 test1234!)",
    );
    return;
  }
  // 문자 대신 인증번호를 여기서 받아 바로 인증
  let lastCode = "";
  setSmsSenderForTest({
    name: "demo",
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

  const trainer = await signup(db, {
    role: "TRAINER",
    loginId: "trainer1",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    name: "김코치",
    phone: "01000000001",
    verificationId: await verified("01000000001"),
    consents: CONSENTS,
    workplace: { name: "강남 PT", address: "서울 강남구" },
  });
  const student = await signup(db, {
    role: "STUDENT",
    loginId: "student1",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    name: "이수강",
    phone: "01000000002",
    verificationId: await verified("01000000002"),
    consents: CONSENTS,
    pin: "1357",
    pinConfirm: "1357",
    trainer: { trainerUserId: trainer.userId },
  });

  const req = await db.linkRequest.findFirstOrThrow({
    where: { fromUserId: student.userId },
  });
  await respondLinkRequest(db, {
    userId: trainer.userId,
    requestId: req.id,
    accept: true,
  });
  const studentId = (
    await db.student.findUniqueOrThrow({ where: { userId: student.userId } })
  ).id;

  const now = new Date();
  const today = toKstDateKey(now);
  const pass = await createPass(db, trainer.userId, studentId, {
    name: "PT 10회",
    count: 10,
    startDate: toKstDateKey(new Date(now.getTime() - 30 * 86400_000)),
    endDate: toKstDateKey(new Date(now.getTime() + 180 * 86400_000)),
  });
  const consent = await db.ruleConsent.findFirstOrThrow({
    where: { passId: pass.id },
  });
  await respondRuleConsent(db, {
    studentUserId: student.userId,
    consentId: consent.id,
    action: "AGREE",
  });

  await saveAvailability(db, trainer.userId, {
    rules: [1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startTime: "09:00",
      endTime: "22:00",
    })),
    exceptions: [],
  });

  // 내일부터 하루씩, 오전 10시와 저녁 7시를 번갈아 5건
  const created: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const [y, m, d] = toKstDateKey(new Date(now.getTime() + i * 86400_000))
      .split("-")
      .map(Number);
    const r = await createBookingsByTrainer(db, {
      trainerId: trainer.userId,
      studentId,
      start: kstDateTime(y, m, d, i % 2 ? 10 : 19),
      acknowledgeWarnings: true,
    });
    if (!r.needsConfirmation) created.push(...r.created);
  }
  for (const id of created.slice(0, 3)) {
    await respondConfirmRequest(db, {
      userId: student.userId,
      bookingId: id,
      accept: true,
    });
  }

  console.log(`체험 계정을 만들었습니다 (기준일 ${today})
  트레이너: trainer1 / ${PASSWORD}
  수강생:   student1 / ${PASSWORD}  (수업 완료 승인 PIN 1357)
  예약 ${created.length}건 (3건 확정, 나머지는 수강생 확정 대기)`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
