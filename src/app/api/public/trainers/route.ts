import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";

/** 수강생 가입: 이름으로 트레이너 검색, 근무지와 함께 표시 (명세 1.1) */
export const GET = route(async (request) => {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ trainers: [] });
  const rows = await getDb().user.findMany({
    where: { role: "TRAINER", status: "ACTIVE", name: { contains: q } },
    select: {
      id: true,
      name: true,
      trainerProfile: { select: { workplaceText: true } },
      memberships: {
        where: { status: "ACTIVE" },
        select: { center: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json({
    trainers: rows.map((t) => ({
      id: t.id,
      name: t.name,
      workplace:
        t.memberships[0]?.center.name ??
        t.trainerProfile?.workplaceText ??
        "근무지 미등록",
    })),
  });
});
