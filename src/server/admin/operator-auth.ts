import { hashSecret, verifySecret } from "@/lib/auth/hash";
import {
  OPERATOR_LOCK,
  isLocked,
  registerFailure,
  registerSuccess,
  remainingLockMinutes,
} from "@/lib/auth/lockout";
import { validateLoginId, validatePassword } from "@/lib/auth/policy";
import { hashSessionToken, newSessionToken } from "@/lib/auth/session-rules";
import {
  LOGIN_CHALLENGE_MS,
  OPERATOR_IDLE_MS,
  isOperatorSessionActive,
  slideOperatorSession,
  validateRollbackPin,
} from "@/lib/admin/rules";
import { writeAuditLog } from "@/lib/audit";
import { optionalEnv } from "@/lib/env";
import { isValidMobilePhone, normalizePhone } from "@/lib/phone";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import {
  consumeVerification,
  issueCode,
  verifyCode,
} from "@/server/auth/sms-service";

const FAILED = "아이디 또는 비밀번호가 맞지 않습니다";

let dummy: Promise<{ hash: string; salt: string }> | null = null;
function dummyHash() {
  dummy ??= hashSecret("operator-dummy-password");
  return dummy;
}

function lockedError(
  lock: { failCount: number; lockedUntil: Date | null },
  now: Date,
) {
  return new AppError(
    "LOCKED",
    `5회 실패해 잠겼습니다. ${remainingLockMinutes(lock, now)}분 뒤에 다시 시도해 주세요`,
    423,
  );
}

async function registerLoginFailure(
  db: Db,
  op: { id: string; failCount: number; lockedUntil: Date | null },
  now: Date,
) {
  const next = registerFailure(op, now, OPERATOR_LOCK);
  await db.operatorAccount.update({
    where: { id: op.id },
    data: { failCount: next.failCount, lockedUntil: next.lockedUntil },
  });
  if (next.lockedUntil) {
    await writeAuditLog(db, {
      actor: { type: "SYSTEM" },
      entity: "OperatorAccount",
      entityId: op.id,
      action: "operator.loginLocked",
      after: { lockedUntil: next.lockedUntil },
      at: now,
    });
    throw new AppError(
      "LOCKED",
      "5회 실패해 30분 동안 잠겼습니다. 30분 뒤에 다시 시도해 주세요",
      423,
    );
  }
}

/**
 * 1단계: 아이디·비밀번호. 맞으면 등록된 휴대폰으로 인증번호를 보내고
 * 2단계용 토큰을 돌려준다 (12.1). 5회 실패 30분 잠금.
 */
export async function operatorLoginStart(
  db: RootDb,
  input: { loginId: string; password: string },
  now = new Date(),
): Promise<{ challengeToken: string; phoneHint: string }> {
  const op = await db.operatorAccount.findUnique({
    where: { loginId: input.loginId.trim() },
  });
  if (!op || op.status !== "ACTIVE" || !op.passwordHash || !op.passwordSalt) {
    await verifySecret(input.password, await dummyHash());
    throw new AppError("LOGIN_FAILED", FAILED, 401);
  }
  if (isLocked(op, now)) throw lockedError(op, now);
  const ok = await verifySecret(input.password, {
    hash: op.passwordHash,
    salt: op.passwordSalt,
  });
  if (!ok) {
    await registerLoginFailure(db, op, now);
    throw new AppError("LOGIN_FAILED", FAILED, 401);
  }
  const sms = await issueCode(db, op.phone, "ADMIN_2FA", now);
  const token = newSessionToken();
  await db.operatorLoginChallenge.create({
    data: {
      tokenHash: hashSessionToken(token),
      operatorId: op.id,
      smsVerificationId: sms.verificationId,
      expiresAt: new Date(now.getTime() + LOGIN_CHALLENGE_MS),
      createdAt: now,
    },
  });
  return { challengeToken: token, phoneHint: op.phone.slice(-4) };
}

/** 2단계: 휴대폰 인증번호 → 관리자 세션 (자동 로그인 없음, 30분) */
export async function operatorLoginVerify(
  db: RootDb,
  input: { challengeToken: string; code: string; ip?: string | null },
  now = new Date(),
): Promise<{ token: string; operatorId: string }> {
  const ch = await db.operatorLoginChallenge.findUnique({
    where: { tokenHash: hashSessionToken(input.challengeToken) },
    include: { operator: true },
  });
  if (!ch || ch.consumedAt || ch.expiresAt <= now)
    throw new AppError(
      "CHALLENGE_EXPIRED",
      "처음부터 다시 로그인해 주세요",
      401,
    );
  const op = ch.operator;
  if (op.status !== "ACTIVE") throw new AppError("LOGIN_FAILED", FAILED, 401);
  if (isLocked(op, now)) throw lockedError(op, now);
  try {
    await verifyCode(
      db,
      { verificationId: ch.smsVerificationId, code: input.code },
      now,
    );
  } catch (e) {
    // 인증번호 오류도 로그인 실패로 센다
    await registerLoginFailure(db, op, now);
    throw e;
  }
  const token = newSessionToken();
  await db.$transaction(async (tx) => {
    const used = await tx.operatorLoginChallenge.updateMany({
      where: { id: ch.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (used.count !== 1)
      throw new AppError(
        "CHALLENGE_EXPIRED",
        "처음부터 다시 로그인해 주세요",
        401,
      );
    await consumeVerification(
      tx,
      {
        verificationId: ch.smsVerificationId,
        purpose: "ADMIN_2FA",
        phone: op.phone,
      },
      now,
    );
    const reset = registerSuccess();
    await tx.operatorAccount.update({
      where: { id: op.id },
      data: { ...reset, lastLoginAt: now },
    });
    await tx.operatorSession.create({
      data: {
        tokenHash: hashSessionToken(token),
        operatorId: op.id,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + OPERATOR_IDLE_MS),
        ip: input.ip?.slice(0, 64) ?? null,
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: op.id },
      entity: "OperatorAccount",
      entityId: op.id,
      action: "operator.login",
      after: { ip: input.ip ?? null },
      at: now,
    });
  });
  return { token, operatorId: op.id };
}

export interface ResolvedOperator {
  operatorId: string;
  name: string;
  loginId: string;
  sessionId: string;
}

export async function resolveOperatorSession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<ResolvedOperator | null> {
  if (!token) return null;
  const s = await db.operatorSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { operator: true },
  });
  if (!s || !isOperatorSessionActive(s, now) || s.operator.status !== "ACTIVE")
    return null;
  const slide = slideOperatorSession(s, now);
  if (slide)
    await db.operatorSession.update({ where: { id: s.id }, data: slide });
  return {
    operatorId: s.operatorId,
    name: s.operator.name,
    loginId: s.operator.loginId ?? "",
    sessionId: s.id,
  };
}

export async function revokeOperatorSession(
  db: Db,
  token: string,
  now = new Date(),
) {
  await db.operatorSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
}

/** 계정 비밀값 형식 검사 (첫 관리자·초대 수락 공통) */
export function validateOperatorCredentials(input: {
  loginId: string;
  password: string;
  rollbackPin: string;
}) {
  for (const r of [
    validateLoginId(input.loginId),
    validatePassword(input.password, input.loginId),
    validateRollbackPin(input.rollbackPin),
  ]) {
    if (!r.ok) throw new AppError("INVALID", r.message);
  }
}

/**
 * 첫 관리자: 관리자가 한 명도 없을 때만 환경 변수(OPERATOR_INIT_*)로 만든다 (12.1).
 * 값은 코드·문서·시드에 쓰지 않고, 로그에도 남기지 않는다.
 */
export async function bootstrapFirstOperator(
  db: RootDb,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<"created" | "exists" | "skipped"> {
  if ((await db.operatorAccount.count()) > 0) return "exists";
  const get = (k: string) => {
    const v = env[k];
    return v === undefined || v === "" ? undefined : v;
  };
  const loginId = get("OPERATOR_INIT_LOGIN_ID");
  const password = get("OPERATOR_INIT_PASSWORD");
  const rollbackPin = get("OPERATOR_INIT_ROLLBACK_PIN");
  const name = get("OPERATOR_INIT_NAME");
  const phone = get("OPERATOR_INIT_PHONE");
  if (!loginId || !password || !rollbackPin || !name || !phone)
    return "skipped";
  validateOperatorCredentials({ loginId, password, rollbackPin });
  if (!isValidMobilePhone(phone))
    throw new AppError(
      "INVALID_PHONE",
      "OPERATOR_INIT_PHONE 형식을 확인해 주세요",
    );
  const pw = await hashSecret(password);
  const pin = await hashSecret(rollbackPin);
  await db.$transaction(async (tx) => {
    // 서버 여러 대가 동시에 떠도 한 명만 만든다
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('operator:bootstrap'))`;
    if ((await tx.operatorAccount.count()) > 0) return;
    const op = await tx.operatorAccount.create({
      data: {
        loginId,
        passwordHash: pw.hash,
        passwordSalt: pw.salt,
        rollbackPinHash: pin.hash,
        rollbackPinSalt: pin.salt,
        name,
        phone: normalizePhone(phone),
        status: "ACTIVE",
        activatedAt: now,
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "SYSTEM" },
      entity: "OperatorAccount",
      entityId: op.id,
      action: "operator.bootstrap",
      after: { name },
      at: now,
    });
  });
  return "created";
}

/** 환경 변수 ADMIN_ALLOWED_IPS (쉼표 구분) */
export function adminAllowList(): string | undefined {
  return optionalEnv("ADMIN_ALLOWED_IPS");
}
