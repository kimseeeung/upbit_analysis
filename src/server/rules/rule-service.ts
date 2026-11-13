import { writeAuditLog } from "@/lib/audit";
import {
  DEFAULT_RULES,
  pickRuleValues,
  sameRules,
  type RuleValues,
} from "@/lib/rules/rule-set";
import type { Db, RootDb } from "@/server/db-types";
import { queueNotification } from "@/server/notify/notify-service";

async function notifyConsentRequest(
  db: Db,
  studentId: string,
  passName: string,
  now: Date,
) {
  const s = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  await queueNotification(
    db,
    {
      userId: s.userId,
      studentId,
      type: "RULE_CONSENT_REQUEST",
      title: "수강 규칙 동의 요청",
      body: `${passName} 수강 규칙을 확인하고 동의해 주세요.`,
      url: "/s/requests",
      responseRequired: true,
    },
    now,
  );
}
import { AppError } from "@/server/errors";

/** 트레이너 기본 규칙의 최신 버전. 없으면 기본값으로 v1을 만든다. */
export async function getTrainerDefaultRuleSet(db: Db, trainerId: string) {
  const latest = await db.ruleSet.findFirst({
    where: { kind: "TRAINER_DEFAULT", ownerTrainerId: trainerId },
    orderBy: { version: "desc" },
  });
  if (latest) return latest;
  return db.ruleSet.create({
    data: {
      kind: "TRAINER_DEFAULT",
      ownerTrainerId: trainerId,
      version: 1,
      ...DEFAULT_RULES,
    },
  });
}

/** 기본 규칙 변경: 값이 바뀌었을 때만 새 버전을 만든다. 이미 등록한 이용권에는 영향 없음 */
export async function updateTrainerDefaultRules(
  db: RootDb,
  trainerId: string,
  values: RuleValues,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const current = await getTrainerDefaultRuleSet(tx, trainerId);
    if (sameRules(pickRuleValues(current), values)) return current;
    const next = await tx.ruleSet.create({
      data: {
        kind: "TRAINER_DEFAULT",
        ownerTrainerId: trainerId,
        version: current.version + 1,
        ...values,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "RuleSet",
      entityId: next.id,
      action: "rules.updateDefault",
      before: pickRuleValues(current),
      after: values,
      at: now,
    });
    return next;
  });
}

/**
 * 이용권에 붙일 규칙. 기본 규칙과 같으면 기본 규칙 버전을 그대로 쓰고,
 * 수강생별로 고쳤으면 이용권 전용 규칙(PASS)을 새로 만든다.
 */
export async function resolveRuleSetForPass(
  db: Db,
  trainerId: string,
  custom: RuleValues | null,
  previousPassVersion = 0,
) {
  const base = await getTrainerDefaultRuleSet(db, trainerId);
  if (!custom || sameRules(pickRuleValues(base), custom)) return base;
  return db.ruleSet.create({
    data: {
      kind: "PASS",
      ownerTrainerId: trainerId,
      version: previousPassVersion + 1,
      ...custom,
    },
  });
}

/**
 * 규칙 동의 요청. 이용권의 최신 규칙에 대해 대기 중 요청이 없으면 만든다.
 * 이전 규칙에 대한 대기 요청은 SUPERSEDED로 닫는다.
 * 알림(웹 푸시·카톡 공유)은 M5에서 붙인다.
 */
export async function requestRuleConsent(
  db: Db,
  passId: string,
  actorUserId: string,
  now = new Date(),
) {
  const pass = await db.pass.findUniqueOrThrow({ where: { id: passId } });
  if (pass.agreedRuleSetId === pass.ruleSetVersionId) {
    throw new AppError("ALREADY_AGREED", "이미 이 규칙에 동의한 이용권입니다");
  }
  await db.ruleConsent.updateMany({
    where: {
      passId,
      status: { in: ["PENDING", "INQUIRED"] },
      ruleSetVersionId: { not: pass.ruleSetVersionId },
    },
    data: { status: "SUPERSEDED" },
  });
  const pending = await db.ruleConsent.findFirst({
    where: {
      passId,
      ruleSetVersionId: pass.ruleSetVersionId,
      status: { in: ["PENDING", "INQUIRED"] },
    },
  });
  if (pending) {
    // 다시 보내기: 요청 시각만 새로 (리마인드 기준)
    const again = await db.ruleConsent.update({
      where: { id: pending.id },
      data: { status: "PENDING", requestedAt: now },
    });
    await notifyConsentRequest(db, pass.studentId, pass.name, now);
    return again;
  }
  const consent = await db.ruleConsent.create({
    data: {
      passId,
      ruleSetVersionId: pass.ruleSetVersionId,
      studentId: pass.studentId,
      requestedAt: now,
    },
  });
  await writeAuditLog(db, {
    actor: { type: "USER", id: actorUserId },
    entity: "RuleConsent",
    entityId: consent.id,
    action: "rules.requestConsent",
    after: { passId, ruleSetVersionId: pass.ruleSetVersionId },
    at: now,
  });
  await notifyConsentRequest(db, pass.studentId, pass.name, now);
  return consent;
}

/** 수강생의 동의 / 문의하기 */
export async function respondRuleConsent(
  db: RootDb,
  input: {
    /** null이면 카톡 1회용 링크로 응답 (링크가 본인 확인을 대신함) */
    studentUserId: string | null;
    consentId: string;
    action: "AGREE" | "INQUIRE";
    inquiryText?: string;
  },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const consent = await tx.ruleConsent.findFirst({
      where: {
        id: input.consentId,
        ...(input.studentUserId
          ? { student: { userId: input.studentUserId } }
          : {}),
      },
      include: { pass: true },
    });
    if (!consent)
      throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    if (consent.status === "AGREED")
      throw new AppError("ALREADY_AGREED", "이미 동의했습니다");
    if (
      consent.status === "SUPERSEDED" ||
      consent.pass.ruleSetVersionId !== consent.ruleSetVersionId
    ) {
      throw new AppError(
        "SUPERSEDED",
        "규칙이 바뀌었습니다. 새 요청을 확인해 주세요",
      );
    }
    if (input.action === "AGREE") {
      await tx.ruleConsent.update({
        where: { id: consent.id },
        data: { status: "AGREED", agreedAt: now },
      });
      await tx.pass.update({
        where: { id: consent.passId },
        data: { agreedRuleSetId: consent.ruleSetVersionId, agreedAt: now },
      });
    } else {
      await tx.ruleConsent.update({
        where: { id: consent.id },
        data: {
          status: "INQUIRED",
          inquiredAt: now,
          inquiryText: input.inquiryText?.trim().slice(0, 500) || null,
        },
      });
    }
    await writeAuditLog(tx, {
      actor: input.studentUserId
        ? { type: "USER", id: input.studentUserId }
        : { type: "SYSTEM" },
      entity: "RuleConsent",
      entityId: consent.id,
      action: input.action === "AGREE" ? "rules.agree" : "rules.inquire",
      after: {
        passId: consent.passId,
        ruleSetVersionId: consent.ruleSetVersionId,
      },
      at: now,
    });
    const student = await tx.student.findUniqueOrThrow({
      where: { id: consent.studentId },
    });
    await queueNotification(
      tx,
      {
        userId: consent.pass.soldByTrainerId,
        type: "RULE_CONSENT_RESULT",
        title: input.action === "AGREE" ? "규칙 동의" : "규칙 문의",
        body:
          input.action === "AGREE"
            ? `${student.name}님이 ${consent.pass.name} 수강 규칙에 동의했습니다.`
            : `${student.name}님이 ${consent.pass.name} 수강 규칙에 대해 문의했습니다.`,
        url: `/t/students/${consent.studentId}/passes`,
      },
      now,
    );
  });
}

/**
 * 이 이용권에 지금 적용하는 규칙과 동의 여부 (3.5).
 * 동의한 규칙이 있으면 그것을 적용(새 규칙에 동의하기 전까지 이전 규칙).
 * 한 번도 동의하지 않았으면 제안한 규칙을 "미동의" 상태로 적용한다
 * (노쇼·당일 취소 차감 안 함, 미승인 자동 완료 안 함 — M4).
 */
export function effectiveRules(pass: {
  ruleSetVersionId: string;
  agreedRuleSetId: string | null;
}): { ruleSetId: string; agreed: boolean; pendingNewRules: boolean } {
  if (pass.agreedRuleSetId) {
    return {
      ruleSetId: pass.agreedRuleSetId,
      agreed: true,
      pendingNewRules: pass.agreedRuleSetId !== pass.ruleSetVersionId,
    };
  }
  return {
    ruleSetId: pass.ruleSetVersionId,
    agreed: false,
    pendingNewRules: true,
  };
}
