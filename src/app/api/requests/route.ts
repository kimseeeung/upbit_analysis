import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { describeRules, pickRuleValues } from "@/lib/rules/rule-set";
import { maskPhone } from "@/lib/phone";
import { getBookingInbox } from "@/server/bookings/inbox-service";
import { pendingPausesFor } from "@/server/passes/pause-service";
import { pendingDepartureChoices } from "@/server/center/departure-service";
import { transferInbox } from "@/server/center/transfer-service";
import { requireApiSession, route } from "@/server/http";

/** 요청함: 받은 연결 요청 + (수강생) 규칙 동의 요청 */
export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER", "STUDENT"]);
  const db = getDb();
  const links = await db.linkRequest.findMany({
    where: { toUserId: s.principal.userId, status: "PENDING" },
    include: {
      fromUser: {
        select: {
          name: true,
          phone: true,
          role: true,
          trainerProfile: { select: { workplaceText: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const consents =
    s.principal.role === "STUDENT"
      ? await db.ruleConsent.findMany({
          where: {
            student: { userId: s.principal.userId },
            status: { in: ["PENDING", "INQUIRED"] },
          },
          include: {
            ruleSet: true,
            pass: { include: { soldByTrainer: { select: { name: true } } } },
          },
          orderBy: { requestedAt: "desc" },
        })
      : [];
  const bookings = await getBookingInbox(
    db,
    s.principal.userId,
    s.principal.role === "TRAINER" ? "TRAINER" : "STUDENT",
  );
  const pauseRequests = await pendingPausesFor(
    db,
    s.principal.userId,
    s.principal.role === "TRAINER" ? "TRAINER" : "STUDENT",
  );
  const transfers = await transferInbox(
    db,
    s.principal.userId,
    s.principal.role === "TRAINER" ? "TRAINER" : "STUDENT",
  );
  const departureChoices =
    s.principal.role === "STUDENT"
      ? await pendingDepartureChoices(db, s.principal.userId)
      : [];
  return NextResponse.json({
    ...bookings,
    ...transfers,
    departureChoices,
    pauseRequests,
    linkRequests: links.map((l) => ({
      id: l.id,
      fromName: l.fromUser.name,
      fromRole: l.fromUser.role,
      fromPhoneMasked: maskPhone(l.fromUser.phone),
      workplace: l.fromUser.trainerProfile?.workplaceText ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    ruleConsents: consents.map((c) => ({
      id: c.id,
      status: c.status,
      passName: c.pass.name,
      trainerName: c.pass.soldByTrainer.name,
      requestedAt: c.requestedAt.toISOString(),
      rules: describeRules(pickRuleValues(c.ruleSet)),
    })),
  });
});
