import type { UserRole } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret, verifySecret } from "@/lib/auth/hash";
import {
  LOGIN_LOCK,
  isLocked,
  registerFailure,
  registerSuccess,
  remainingLockMinutes,
} from "@/lib/auth/lockout";
import type { RootDb } from "@/server/db-types";
import { AppError, LOGIN_FAILED_MESSAGE } from "@/server/errors";
import { createSession, type CreatedSession } from "./session-service";

let dummyHash: Promise<{ hash: string; salt: string }> | null = null;
/** 없는 아이디도 같은 시간이 걸리게 해 아이디 존재 여부가 드러나지 않게 한다 */
function getDummyHash() {
  if (!dummyHash) dummyHash = hashSecret("dummy-password-for-timing!1");
  return dummyHash;
}

export interface LoginInput {
  role: UserRole;
  loginId: string;
  password: string;
  remember: boolean;
  deviceLabel: string;
}

export async function login(
  db: RootDb,
  input: LoginInput,
  now = new Date(),
): Promise<CreatedSession & { userId: string; role: UserRole }> {
  const loginId = input.loginId.trim();
  const user = await db.user.findUnique({ where: { loginId } });

  if (!user || user.status === "DELETED") {
    await verifySecret(input.password, await getDummyHash());
    throw new AppError("LOGIN_FAILED", LOGIN_FAILED_MESSAGE, 401);
  }

  const lock = {
    failCount: user.loginFailCount,
    lockedUntil: user.lockedUntil,
  };
  if (isLocked(lock, now)) {
    throw new AppError(
      "LOCKED",
      `로그인에 5회 연속 실패해 잠겼습니다. ${remainingLockMinutes(lock, now)}분 뒤에 다시 시도해 주세요`,
      423,
    );
  }

  const passwordOk = await verifySecret(input.password, {
    hash: user.passwordHash,
    salt: user.passwordSalt,
  });
  // 유형을 잘못 고른 것도 같은 실패로 센다(어떤 유형의 아이디인지 드러내지 않음)
  if (!passwordOk || user.role !== input.role) {
    const next = registerFailure(lock, now, LOGIN_LOCK);
    await db.user.update({
      where: { id: user.id },
      data: { loginFailCount: next.failCount, lockedUntil: next.lockedUntil },
    });
    if (next.lockedUntil) {
      await writeAuditLog(db, {
        actor: { type: "SYSTEM" },
        entity: "User",
        entityId: user.id,
        action: "user.loginLocked",
        after: { lockedUntil: next.lockedUntil },
        at: now,
      });
      throw new AppError(
        "LOCKED",
        "로그인에 5회 연속 실패해 10분 동안 잠겼습니다. 10분 뒤에 다시 시도해 주세요",
        423,
      );
    }
    throw new AppError("LOGIN_FAILED", LOGIN_FAILED_MESSAGE, 401);
  }

  const reset = registerSuccess();
  const session = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { loginFailCount: reset.failCount, lockedUntil: reset.lockedUntil },
    });
    return createSession(
      tx,
      {
        userId: user.id,
        persistent: input.remember,
        deviceLabel: input.deviceLabel,
      },
      now,
    );
  });
  return { ...session, userId: user.id, role: user.role };
}
