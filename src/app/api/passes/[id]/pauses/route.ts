import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, requireApiSession, route } from "@/server/http";
import { pauseActor } from "@/server/pause-actor";
import { listPauses, requestPause } from "@/server/passes/pause-service";
import { asString } from "@/server/validate";

type Ctx = RouteContext<"/api/passes/[id]/pauses">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const s = await requireApiSession(["TRAINER", "STUDENT"]);
  const { id } = await ctx.params;
  const db = getDb();
  // 권한 확인은 요청과 같은 경로로 (본인·담당 수강생 이용권만)
  const pass = await db.pass.findUnique({
    where: { id },
    include: { student: true },
  });
  const ok =
    pass &&
    (s.principal.role === "STUDENT"
      ? pass.student.userId === s.principal.userId
      : (await db.trainerStudentLink.count({
          where: {
            trainerId: s.principal.userId,
            studentId: pass.studentId,
            endedAt: null,
          },
        })) > 0);
  if (!ok) return NextResponse.json({ pauses: [] });
  return NextResponse.json({ pauses: await listPauses(db, [id]) });
});

export const POST = route<Ctx>(async (request, ctx) => {
  const s = await requireApiSession(["TRAINER", "STUDENT"]);
  const { id } = await ctx.params;
  const b = await readJson<Record<string, unknown>>(request);
  const p = await requestPause(getDb(), {
    actor: pauseActor(s),
    passId: id,
    startDate: asString(b.startDate, "시작일"),
    endDate: asString(b.endDate, "종료일"),
    reason: asString(b.reason, "사유"),
  });
  return NextResponse.json({ pauseId: p.id });
});
