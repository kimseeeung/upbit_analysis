import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";
import { getStudentStatsDetail } from "@/server/stats/stats-service";

export const GET = route<RouteContext<"/api/t/stats/[studentId]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { studentId } = await ctx.params;
    const u = new URL(request.url);
    return NextResponse.json(
      await getStudentStatsDetail(
        getDb(),
        s.principal.userId,
        studentId,
        u.searchParams.get("from") ?? "",
        u.searchParams.get("to") ?? "",
      ),
    );
  },
);
