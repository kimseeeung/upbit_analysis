import { describeRules, pickRuleValues } from "@/lib/rules/rule-set";
import { formatPhone } from "@/lib/phone";
import { toKstDateKey } from "@/lib/time";
import type { Db } from "@/server/db-types";
import { getPassSummaries } from "@/server/passes/availability-service";
import { effectiveRules } from "@/server/rules/rule-service";
import { assertTrainerStudent } from "./access";

async function passesView(db: Db, studentId: string, now: Date) {
  const passes = await db.pass.findMany({
    where: { studentId },
    include: {
      ruleSet: true,
      agreedRuleSet: true,
      soldByTrainer: { select: { name: true } },
      consents: { orderBy: { requestedAt: "desc" }, take: 1 },
      changeLogs: { orderBy: { changedAt: "desc" }, take: 20 },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  const summary = await getPassSummaries(db, studentId, toKstDateKey(now));
  return {
    availableToday: summary.availableToday,
    passes: passes.map((p) => {
      const eff = effectiveRules(p);
      const rules = eff.agreed && p.agreedRuleSet ? p.agreedRuleSet : p.ruleSet;
      const today = toKstDateKey(now);
      const s = summary.byPass[p.id];
      const derivedStatus =
        p.status === "ACTIVE" && toKstDateKey(p.endDate) < today
          ? "EXPIRED"
          : p.status === "ACTIVE" && s.remaining === 0
            ? "EXHAUSTED"
            : p.status;
      return {
        id: p.id,
        name: p.name,
        count: p.count,
        bonusCount: p.bonusCount,
        startDate: toKstDateKey(p.startDate),
        endDate: toKstDateKey(p.endDate),
        sessionMinutes: p.sessionMinutes,
        price: p.price,
        paidAt: p.paidAt ? toKstDateKey(p.paidAt) : null,
        payMethod: p.payMethod,
        memo: p.memo,
        soldBy: p.soldByTrainer.name,
        status: derivedStatus,
        ...s,
        rules: pickRuleValues(p.ruleSet),
        appliedRules: describeRules(pickRuleValues(rules)),
        ruleAgreed: eff.agreed,
        ruleAgreedAt: p.agreedAt?.toISOString() ?? null,
        rulePending: eff.pendingNewRules,
        consent: p.consents[0]
          ? {
              id: p.consents[0].id,
              status: p.consents[0].status,
              requestedAt: p.consents[0].requestedAt.toISOString(),
              inquiryText: p.consents[0].inquiryText,
            }
          : null,
        changeLogs: p.changeLogs.map((c) => ({
          field: c.field,
          before: c.before,
          after: c.after,
          changedAt: c.changedAt.toISOString(),
        })),
      };
    }),
  };
}

/** 트레이너의 수강생 상세 (3.1). 수업 이력은 M3에서 붙인다 */
export async function getStudentDetailForTrainer(
  db: Db,
  trainerId: string,
  studentId: string,
  now = new Date(),
) {
  const link = await assertTrainerStudent(db, trainerId, studentId);
  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      user: { select: { gender: true, birthDate: true, createdAt: true } },
    },
  });
  const p = await passesView(db, studentId, now);
  return {
    studentId,
    name: student.name,
    phone: formatPhone(student.phone),
    registered: !!student.userId,
    gender: student.user?.gender ?? null,
    birthDate: student.user?.birthDate
      ? toKstDateKey(student.user.birthDate)
      : null,
    linkedSince: toKstDateKey(link.startedAt),
    hidden: link.status === "HIDDEN",
    memo: link.memo,
    notifyDayBefore: link.notifyDayBefore,
    notify2h: link.notify2h,
    ...p,
  };
}

/** 수강생 본인의 이용권 (10장 이용권 화면) */
export async function getMyPasses(db: Db, studentId: string, now = new Date()) {
  return passesView(db, studentId, now);
}
