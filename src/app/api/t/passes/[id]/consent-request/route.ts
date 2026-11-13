import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestRuleConsent } from "@/server/rules/rule-service";
import { assertTrainerStudent } from "@/server/students/access";
import { AppError } from "@/server/errors";
import { requireApiSession, route } from "@/server/http";

/** 수강생 상세의 "규칙 동의 요청 보내기" */
export const POST = route<RouteContext<"/api/t/passes/[id]/consent-request">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const db = getDb();
    const pass = await db.pass.findUnique({ where: { id } });
    if (!pass)
      throw new AppError("NOT_FOUND", "이용권을 찾을 수 없습니다", 404);
    await assertTrainerStudent(db, s.principal.userId, pass.studentId);
    await requestRuleConsent(db, id, s.principal.userId);
    return NextResponse.json({ ok: true });
  },
);
