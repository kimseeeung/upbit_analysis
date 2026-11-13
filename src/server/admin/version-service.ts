import type { Prisma } from "@/generated/prisma/client";
import { verifySecret } from "@/lib/auth/hash";
import {
  OPERATOR_LOCK,
  isLocked,
  registerFailure,
  registerSuccess,
  remainingLockMinutes,
} from "@/lib/auth/lockout";
import {
  checkRollbackTarget,
  latestVersion,
  previousVersion,
} from "@/lib/admin/rules";
import { writeAuditLog } from "@/lib/audit";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { getDeployAdapter, type DeployAdapter } from "./deploy-adapter";
import { runHealthCheck, type CheckItem } from "./health-check";
import { alertOtherOperators } from "./operator-service";

const MAINTENANCE_KEY = "maintenance";

/** 사용자 화면 "잠시 점검 중" (12.3-3) */
export async function getMaintenance(
  db: Db,
): Promise<{ on: boolean; message?: string }> {
  const f = await db.systemFlag.findUnique({ where: { key: MAINTENANCE_KEY } });
  const v = (f?.value ?? null) as { on?: boolean; message?: string } | null;
  return { on: !!v?.on, ...(v?.message ? { message: v.message } : {}) };
}

export async function setMaintenance(db: Db, on: boolean, message?: string) {
  const value = {
    on,
    ...(message ? { message } : {}),
  } as Prisma.InputJsonValue;
  await db.systemFlag.upsert({
    where: { key: MAINTENANCE_KEY },
    create: { key: MAINTENANCE_KEY, value },
    update: { value },
  });
}

/**
 * 서버가 뜰 때 지금 버전을 기록한다 (APP_VERSION, DEPLOYED_BY, DEPLOY_SUMMARY).
 * 이미 있는 버전(롤백으로 다시 뜬 경우)이면 그 버전을 지금 버전으로 표시만 한다.
 */
export async function registerCurrentVersion(
  db: RootDb,
  input: { version: string; deployedBy?: string; summary?: string },
  now = new Date(),
) {
  const version = input.version.trim();
  if (!version) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('deploy:version'))`;
    await tx.deployVersion.updateMany({
      where: { isCurrent: true, version: { not: version } },
      data: { isCurrent: false },
    });
    await tx.deployVersion.upsert({
      where: { version },
      create: {
        version,
        deployedAt: now,
        deployedBy: input.deployedBy?.trim() || "배포 시스템",
        summary: input.summary?.trim() ?? "",
        isCurrent: true,
      },
      update: { isCurrent: true },
    });
  });
}

export async function listVersions(db: Db) {
  const versions = await db.deployVersion.findMany({
    orderBy: { deployedAt: "desc" },
  });
  return {
    versions,
    previous: previousVersion(versions)?.version ?? null,
    latest: latestVersion(versions)?.version ?? null,
  };
}

export async function listRollbacks(db: Db) {
  return db.rollbackLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { operator: { select: { name: true } } },
  });
}

/** 롤백 PIN 확인. 5회 오류 시 30분 잠금 (12.3) */
export async function verifyRollbackPin(
  db: Db,
  operatorId: string,
  pin: string,
  now = new Date(),
) {
  const op = await db.operatorAccount.findUniqueOrThrow({
    where: { id: operatorId },
  });
  const lock = {
    failCount: op.rollbackPinFailCount,
    lockedUntil: op.rollbackLockedUntil,
  };
  if (isLocked(lock, now))
    throw new AppError(
      "PIN_LOCKED",
      `롤백 PIN을 5회 틀려 잠겼습니다. ${remainingLockMinutes(lock, now)}분 뒤에 다시 시도해 주세요`,
      423,
    );
  const ok =
    !!op.rollbackPinHash &&
    !!op.rollbackPinSalt &&
    /^\d{6}$/.test(pin) &&
    (await verifySecret(pin, {
      hash: op.rollbackPinHash,
      salt: op.rollbackPinSalt,
    }));
  if (!ok) {
    const next = registerFailure(lock, now, OPERATOR_LOCK);
    await db.operatorAccount.update({
      where: { id: op.id },
      data: {
        rollbackPinFailCount: next.failCount,
        rollbackLockedUntil: next.lockedUntil,
      },
    });
    if (next.lockedUntil) {
      await writeAuditLog(db, {
        actor: { type: "OPERATOR", id: op.id },
        entity: "OperatorAccount",
        entityId: op.id,
        action: "operator.rollbackPinLocked",
        after: { lockedUntil: next.lockedUntil },
        at: now,
      });
      throw new AppError(
        "PIN_LOCKED",
        "롤백 PIN을 5회 틀려 30분 동안 잠겼습니다",
        423,
      );
    }
    throw new AppError(
      "WRONG_PIN",
      `롤백 PIN이 맞지 않습니다 (남은 횟수 ${OPERATOR_LOCK.maxFails - next.failCount}회)`,
      400,
    );
  }
  if (op.rollbackPinFailCount > 0 || op.rollbackLockedUntil) {
    const reset = registerSuccess();
    await db.operatorAccount.update({
      where: { id: op.id },
      data: {
        rollbackPinFailCount: reset.failCount,
        rollbackLockedUntil: reset.lockedUntil,
      },
    });
  }
}

/**
 * 롤백 (12.3): PIN·사유 확인 → 점검 중 표시 → 재배포 → 자동 점검 → 기록.
 * 프로그램만 되돌리고 데이터는 그대로 둔다.
 * "다시 최신 버전으로"도 같은 흐름(대상만 최신 버전).
 */
export async function rollback(
  db: RootDb,
  operatorId: string,
  input: { toVersion: string; pin: string; reason: string },
  deps: {
    adapter?: DeployAdapter;
    healthCheck?: () => Promise<CheckItem[]>;
  } = {},
  now = () => new Date(),
) {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 2)
    throw new AppError("INVALID", "롤백 사유를 입력해 주세요");
  await verifyRollbackPin(db, operatorId, input.pin ?? "", now());

  const versions = await db.deployVersion.findMany();
  const target = checkRollbackTarget(versions, input.toVersion);
  if (!target.ok) throw new AppError("INVALID_TARGET", target.message);
  const running = await db.rollbackLog.findFirst({
    where: { result: "RUNNING" },
  });
  if (running)
    throw new AppError("IN_PROGRESS", "이미 진행 중인 롤백이 있습니다", 409);

  const log = await db.rollbackLog.create({
    data: {
      operatorId,
      fromVersion: target.from,
      toVersion: input.toVersion,
      reason,
      startedAt: now(),
    },
  });
  const op = await db.operatorAccount.findUniqueOrThrow({
    where: { id: operatorId },
  });
  await setMaintenance(
    db,
    true,
    "잠시 점검 중입니다. 곧 다시 이용할 수 있습니다",
  );
  let error: string | null = null;
  let checks: CheckItem[] = [];
  try {
    await (deps.adapter ?? getDeployAdapter()).deploy(input.toVersion);
    checks = await (deps.healthCheck ?? (() => runHealthCheck(db)))();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ok = !error && checks.length > 0 && checks.every((c) => c.ok);
  const finishedAt = now();
  await db.$transaction(async (tx) => {
    if (!error) {
      await tx.deployVersion.updateMany({
        data: { isCurrent: false },
        where: { isCurrent: true },
      });
      await tx.deployVersion.update({
        where: { version: input.toVersion },
        data: { isCurrent: true },
      });
    }
    await tx.rollbackLog.update({
      where: { id: log.id },
      data: {
        finishedAt,
        result: ok ? "SUCCEEDED" : "FAILED",
        healthCheck: checks as unknown as Prisma.InputJsonValue,
        error,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: operatorId },
      entity: "DeployVersion",
      entityId: input.toVersion,
      action: "deploy.rollback",
      before: { version: target.from },
      after: {
        version: input.toVersion,
        reason,
        result: ok ? "SUCCEEDED" : "FAILED",
      },
      at: finishedAt,
    });
    await alertOtherOperators(
      tx,
      operatorId,
      `${op.name}님이 ${target.from} → ${input.toVersion} 롤백을 실행했습니다 (${ok ? "점검 통과" : "점검 실패"})`,
      finishedAt,
    );
  });
  // 재배포가 실패하면 지금 버전이 그대로 돌고 있으므로 점검 표시를 내린다.
  // 점검만 실패한 경우에도 사용자를 계속 막지 않도록 내리고, 결과는 관리자에게 보여 준다.
  await setMaintenance(db, false);
  return db.rollbackLog.findUniqueOrThrow({ where: { id: log.id } });
}
