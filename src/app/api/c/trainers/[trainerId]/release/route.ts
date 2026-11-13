import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { releaseTrainer } from "@/server/center/departure-service";
import { requireApiSession, route } from "@/server/http";

/** 소속 해제: 담당 수강생에게 따라가기/센터에 남기 선택 요청, 7일 뒤 적용 */
export const POST = route<RouteContext<"/api/c/trainers/[trainerId]/release">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
    const { trainerId } = await ctx.params;
    const d = await releaseTrainer(getDb(), s.principal.userId, trainerId);
    return NextResponse.json({ deadlineAt: d.deadlineAt.toISOString() });
  },
);
