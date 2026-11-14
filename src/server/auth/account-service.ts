import type { UserRole } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret, verifySecret } from "@/lib/auth/hash";
import { maskLoginId, validatePassword, validatePin } from "@/lib/auth/policy";
import { normalizePhone } from "@/lib/phone";
import { toKstDateKey } from "@/lib/time";
import type { RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { getSmsSender } from "@/server/sms/sender";
import { revokeAllSessions } from "./session-service";
import { consumeVerification, peekVerification } from "./sms-service";

const NOT_FOUND = "입력한 정보와 일치하는 회원이 없습니다";

async function findMember(
  db: RootDb,
  where: { role: UserRole; name: string; phone: string },
) {
  return db.user.findFirst({
    where: {
      role: where.role,
      name: where.name.trim(),
      phone: normalizePhone(where.phone),
      status: { not: "DELETED" },
    },
  });
}

/** 아이디 찾기: 마스킹된 아이디와 가입일 (명세 2.3) */
export async function findLoginId(
  db: RootDb,
  input: {
    role: UserRole;
    name: string;
    phone: string;
    verificationId: string;
  },
  now = new Date(),
): Promise<{ maskedLoginId: string; joinedAt: Date }> {
  const { phone } = await peekVerification(
    db,
    { verificationId: input.verificationId, purpose: "FIND_ID" },
    now,
  );
  if (phone !== normalizePhone(input.phone)) {
    throw new AppError(
      "VERIFICATION_REQUIRED",
      "휴대폰 본인인증을 다시 해 주세요",
    );
  }
  const user = await findMember(db, input);
  if (!user) throw new AppError("NOT_FOUND", NOT_FOUND, 404);
  return { maskedLoginId: maskLoginId(user.loginId), joinedAt: user.createdAt };
}

/** "전체 아이디 문자로 받기" — 인증 결과를 소비한다 */
export async function sendFullLoginIdBySms(
  db: RootDb,
  input: {
    role: UserRole;
    name: string;
    phone: string;
    verificationId: string;
  },
  now = new Date(),
): Promise<void> {
  const user = await findMember(db, input);
  if (!user) throw new AppError("NOT_FOUND", NOT_FOUND, 404);
  await consumeVerification(
    db,
    {
      verificationId: input.verificationId,
      purpose: "FIND_ID",
      phone: user.phone,
    },
    now,
  );
  await getSmsSender().send(
    user.phone,
    `[머슬매니아] 가입하신 아이디는 ${user.loginId} 입니다. (가입일 ${toKstDateKey(user.createdAt)})`,
  );
}

async function assertNotSameAsRecent(
  password: string,
  user: {
    passwordHash: string;
    passwordSalt: string;
    prevPasswordHash: string | null;
    prevPasswordSalt: string | null;
  },
) {
  const same =
    (await verifySecret(password, {
      hash: user.passwordHash,
      salt: user.passwordSalt,
    })) ||
    (!!user.prevPasswordHash &&
      !!user.prevPasswordSalt &&
      (await verifySecret(password, {
        hash: user.prevPasswordHash,
        salt: user.prevPasswordSalt,
      })));
  if (same) {
    throw new AppError(
      "SAME_PASSWORD",
      "직전에 쓰던 비밀번호는 다시 쓸 수 없습니다",
    );
  }
}

/** 비밀번호 재설정: 본인인증 → 새 비밀번호 → 모든 기기 로그아웃, 로그인 잠금 해제 */
export async function resetPassword(
  db: RootDb,
  input: {
    loginId: string;
    phone: string;
    verificationId: string;
    newPassword: string;
    newPasswordConfirm: string;
  },
  now = new Date(),
): Promise<void> {
  const user = await db.user.findUnique({
    where: { loginId: input.loginId.trim() },
  });
  if (
    !user ||
    user.status === "DELETED" ||
    user.phone !== normalizePhone(input.phone)
  ) {
    throw new AppError("NOT_FOUND", NOT_FOUND, 404);
  }
  const policy = validatePassword(input.newPassword, user.loginId);
  if (!policy.ok) throw new AppError("INVALID", policy.message);
  if (input.newPassword !== input.newPasswordConfirm) {
    throw new AppError("INVALID", "비밀번호 확인이 일치하지 않습니다");
  }
  await assertNotSameAsRecent(input.newPassword, user);
  const hashed = await hashSecret(input.newPassword);

  await db.$transaction(async (tx) => {
    await consumeVerification(
      tx,
      {
        verificationId: input.verificationId,
        purpose: "RESET_PW",
        phone: user.phone,
      },
      now,
    );
    await tx.user.update({
      where: { id: user.id },
      data: {
        prevPasswordHash: user.passwordHash,
        prevPasswordSalt: user.passwordSalt,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        passwordChangedAt: now,
        loginFailCount: 0,
        lockedUntil: null,
      },
    });
    await revokeAllSessions(tx, user.id, {}, now);
    await writeAuditLog(tx, {
      actor: { type: "USER", id: user.id },
      entity: "User",
      entityId: user.id,
      action: "user.resetPassword",
      at: now,
    });
  });
}

/** 비밀번호 변경(로그인 상태): 현재 비밀번호 재입력, 다른 기기 로그아웃 */
export async function changePassword(
  db: RootDb,
  input: {
    userId: string;
    currentSessionId: string;
    currentPassword: string;
    newPassword: string;
    newPasswordConfirm: string;
  },
  now = new Date(),
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  const ok = await verifySecret(input.currentPassword, {
    hash: user.passwordHash,
    salt: user.passwordSalt,
  });
  if (!ok)
    throw new AppError("WRONG_PASSWORD", "현재 비밀번호가 맞지 않습니다");
  const policy = validatePassword(input.newPassword, user.loginId);
  if (!policy.ok) throw new AppError("INVALID", policy.message);
  if (input.newPassword !== input.newPasswordConfirm) {
    throw new AppError("INVALID", "비밀번호 확인이 일치하지 않습니다");
  }
  await assertNotSameAsRecent(input.newPassword, user);
  const hashed = await hashSecret(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        prevPasswordHash: user.passwordHash,
        prevPasswordSalt: user.passwordSalt,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        passwordChangedAt: now,
      },
    });
    await revokeAllSessions(
      tx,
      user.id,
      { exceptSessionId: input.currentSessionId },
      now,
    );
    await writeAuditLog(tx, {
      actor: { type: "USER", id: user.id },
      entity: "User",
      entityId: user.id,
      action: "user.changePassword",
      at: now,
    });
  });
}

/** PIN 재설정(본인인증 후). 잠긴 PIN도 풀린다 (명세 2.3, 5.1) */
export async function resetPin(
  db: RootDb,
  input: {
    userId: string;
    verificationId: string;
    pin: string;
    pinConfirm: string;
  },
  now = new Date(),
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: input.userId },
    include: { studentProfile: true },
  });
  if (user.role !== "STUDENT" || !user.studentProfile) {
    throw new AppError("FORBIDDEN", "수강생만 PIN을 설정할 수 있습니다", 403);
  }
  const policy = validatePin(
    input.pin,
    user.birthDate ? toKstDateKey(user.birthDate) : null,
  );
  if (!policy.ok) throw new AppError("INVALID", policy.message);
  if (input.pin !== input.pinConfirm) {
    throw new AppError("INVALID", "PIN 확인이 일치하지 않습니다");
  }
  const hashed = await hashSecret(input.pin);
  await db.$transaction(async (tx) => {
    await consumeVerification(
      tx,
      {
        verificationId: input.verificationId,
        purpose: "RESET_PIN",
        phone: user.phone,
      },
      now,
    );
    await tx.studentProfile.update({
      where: { userId: user.id },
      data: {
        pinHash: hashed.hash,
        pinSalt: hashed.salt,
        pinFailCount: 0,
        pinLockedUntil: null,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: user.id },
      entity: "StudentProfile",
      entityId: user.studentProfile!.id,
      action: "student.resetPin",
      at: now,
    });
  });
}

/** 내 정보 수정: 이름, (트레이너) 직접 입력 근무지 */
export async function updateProfile(
  db: RootDb,
  input: {
    userId: string;
    name: string;
    workplaceText?: string | null;
    workplaceAddress?: string | null;
  },
  now = new Date(),
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new AppError("INVALID", "이름을 입력해 주세요");
  if (name.length > 30)
    throw new AppError("INVALID", "이름은 30자까지 입력할 수 있습니다");
  const user = await db.user.findUniqueOrThrow({
    where: { id: input.userId },
    include: { trainerProfile: true },
  });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { name } });
    if (user.role === "STUDENT") {
      await tx.student.updateMany({
        where: { userId: user.id },
        data: { name },
      });
    }
    if (
      user.role === "TRAINER" &&
      user.trainerProfile &&
      input.workplaceText !== undefined
    ) {
      await tx.trainerProfile.update({
        where: { userId: user.id },
        data: {
          workplaceText: input.workplaceText?.trim() || null,
          workplaceAddress: input.workplaceAddress?.trim() || null,
        },
      });
    }
    await writeAuditLog(tx, {
      actor: { type: "USER", id: user.id },
      entity: "User",
      entityId: user.id,
      action: "user.updateProfile",
      before: {
        name: user.name,
        workplaceText: user.trainerProfile?.workplaceText,
      },
      after: { name, workplaceText: input.workplaceText },
      at: now,
    });
  });
}

/** 전화번호 변경: 새 번호로 본인인증 */
export async function changePhone(
  db: RootDb,
  input: { userId: string; phone: string; verificationId: string },
  now = new Date(),
): Promise<void> {
  const phone = normalizePhone(input.phone);
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  await db.$transaction(async (tx) => {
    await consumeVerification(
      tx,
      { verificationId: input.verificationId, purpose: "CHANGE_PHONE", phone },
      now,
    );
    if (await tx.user.findUnique({ where: { phone }, select: { id: true } })) {
      throw new AppError("PHONE_TAKEN", "이미 가입된 전화번호입니다");
    }
    await tx.user.update({
      where: { id: user.id },
      data: { phone, phoneVerifiedAt: now },
    });
    if (user.role === "STUDENT") {
      await tx.student.updateMany({
        where: { userId: user.id },
        data: { phone },
      });
    }
    await writeAuditLog(tx, {
      actor: { type: "USER", id: user.id },
      entity: "User",
      entityId: user.id,
      action: "user.changePhone",
      before: { phone: user.phone },
      after: { phone },
      at: now,
    });
  });
}
