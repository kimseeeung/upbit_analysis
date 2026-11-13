import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";

/** 트레이너 가입: 가입한 센터 검색 (명세 1.1) */
export const GET = route(async (request) => {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ centers: [] });
  const rows = await getDb().center.findMany({
    where: { status: "ACTIVE", name: { contains: q } },
    select: { id: true, name: true, address: true, verified: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json({ centers: rows });
});
