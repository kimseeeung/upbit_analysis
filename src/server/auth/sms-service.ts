import type { SmsPurpose } from "@/generated/prisma/client";
import { hashSecret, verifySecret } from "@/lib/auth/hash";
import {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  canConsumeVerification,
  checkCanSend,
  generateSmsCode,
  precheckAttempt,
} from "@/lib/auth/sms-rules";
import { isValidMobilePhone, normalizePhone } from "@/lib/phone";
import { startOfKstDay } from "@/lib/time";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { getSmsSender } from "@/server/sms/sender";

/** 회원만 받을 수 있는 용도 / 비회원 번호만 받을 수 있는 용도 */
const MEMBER_ONLY: SmsPurpose[] = [
  "FIND_ID",
  "RESET_PW",
  "RESET_PIN",
  "WITHDRAW",
];
const NEW_NUMBER_ONLY: SmsPurpose[] = ["SIGNUP", "CHANGE_PHONE"];

export interface SendCodeResult {
  verificationId: string;
  expiresAt: Date;
  resendAfterSec: number;
}

export async function sendVerificationCode(
  db: Db,
  input: { phone: string; purpose: SmsPurpose },
  now = new Date(),
): Promise<SendCodeResult> {
  const phone = normalizePhone(input.phone);
  if (!isValidMobilePhone(phone)) {
    throw new AppError("INVALID_PHONE", "휴대폰 번호를 확인해 주세요");
  }
  if (input.purpose === "ADMIN_2FA") {
    throw new AppError("UNSUPPORTED", "지원하지 않는 인증입니다");
  }

  const existing = await db.user.findUnique({
    where: { phone },
    select: { id: true, status: true },
  });
  const isMember = !!existing && existing.status !== "DELETED";
  if (NEW_NUMBER_ONLY.includes(input.purpose) && existing) {
    throw new AppError("PHONE_TAKEN", "이미 가입된 전화번호입니다");
  }
  if (MEMBER_ONLY.includes(input.purpose) && !isMember) {
    throw new AppError(
      "PHONE_NOT_FOUND",
      "이 전화번호로 가입한 회원이 없습니다",
    );
  }

  // 하루 5회는 한국 날짜 기준이므로 전날 00:00 KST부터 넉넉히 읽는다
  const recent = await db.smsVerification.findMany({
    where: {
      phone,
      createdAt: { gte: new Date(startOfKstDay(now).getTime() - 1) },
    },
    select: { createdAt: true },
  });
  const check = checkCanSend(
    recent.map((r) => r.createdAt),
    now,
  );
  if (!check.ok) {
    throw new AppError(
      check.reason,
      check.message,
      429,
      check.reason === "COOLDOWN" ? { retryAfterSec: check.retryAfterSec } : {},
    );
  }

  const code = generateSmsCode();
  const hashed = await hashSecret(code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const row = await db.smsVerification.create({
    data: {
      phone,
      purpose: input.purpose,
      codeHash: hashed.hash,
      codeSalt: hashed.salt,
      expiresAt,
      createdAt: now,
    },
  });
  await getSmsSender().send(
    phone,
    `[PT 관리] 인증번호 [${code}]를 3분 안에 입력해 주세요.`,
  );
  return {
    verificationId: row.id,
    expiresAt,
    resendAfterSec: RESEND_COOLDOWN_MS / 1000,
  };
}

export async function verifyCode(
  db: Db,
  input: { verificationId: string; code: string },
  now = new Date(),
): Promise<{ phone: string; purpose: SmsPurpose }> {
  const v = await db.smsVerification.findUnique({
    where: { id: input.verificationId },
  });
  if (!v) throw new AppError("NOT_FOUND", "인증번호를 다시 받아 주세요");
  const pre = precheckAttempt(v, now);
  if (!pre.ok) throw new AppError(pre.reason, pre.message);

  const match =
    /^\d{6}$/.test(input.code) &&
    (await verifySecret(input.code, { hash: v.codeHash, salt: v.codeSalt }));
  if (!match) {
    const attempts = v.attempts + 1;
    await db.smsVerification.update({
      where: { id: v.id },
      data: { attempts },
    });
    const left = 5 - attempts;
    throw new AppError(
      left <= 0 ? "TOO_MANY" : "WRONG_CODE",
      left <= 0
        ? "5회 틀려서 이 인증번호는 쓸 수 없습니다. 새 인증번호를 받아 주세요"
        : `인증번호가 맞지 않습니다 (남은 횟수 ${left}회)`,
    );
  }
  await db.smsVerification.update({
    where: { id: v.id },
    data: { verifiedAt: now },
  });
  return { phone: v.phone, purpose: v.purpose };
}

/**
 * 인증 완료 결과를 한 번 사용한다(가입·재설정 등).
 * 같은 트랜잭션 안에서 호출해 실패하면 함께 되돌린다.
 */
export async function consumeVerification(
  db: Db,
  input: { verificationId: string; purpose: SmsPurpose; phone?: string },
  now = new Date(),
): Promise<{ phone: string }> {
  const v = await db.smsVerification.findUnique({
    where: { id: input.verificationId },
  });
  if (
    !v ||
    v.purpose !== input.purpose ||
    (input.phone && v.phone !== normalizePhone(input.phone)) ||
    !canConsumeVerification(v, now)
  ) {
    throw new AppError(
      "VERIFICATION_REQUIRED",
      "휴대폰 본인인증을 다시 해 주세요",
    );
  }
  const updated = await db.smsVerification.updateMany({
    where: { id: v.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (updated.count !== 1) {
    throw new AppError(
      "VERIFICATION_REQUIRED",
      "휴대폰 본인인증을 다시 해 주세요",
    );
  }
  return { phone: v.phone };
}

/** 소비하지 않고 확인만 (아이디 찾기 결과 보기) */
export async function peekVerification(
  db: Db,
  input: { verificationId: string; purpose: SmsPurpose },
  now = new Date(),
): Promise<{ phone: string }> {
  const v = await db.smsVerification.findUnique({
    where: { id: input.verificationId },
  });
  if (!v || v.purpose !== input.purpose || !canConsumeVerification(v, now)) {
    throw new AppError(
      "VERIFICATION_REQUIRED",
      "휴대폰 본인인증을 다시 해 주세요",
    );
  }
  return { phone: v.phone };
}
