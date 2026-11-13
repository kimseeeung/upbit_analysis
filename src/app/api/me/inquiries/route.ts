import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, requireApiSession, route } from "@/server/http";
import { createInquiry, listMyInquiries } from "@/server/admin/notice-service";

export const GET = route(async () => {
  const s = await requireApiSession();
  return NextResponse.json({
    inquiries: await listMyInquiries(getDb(), s.principal.userId),
  });
});

export const POST = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<{ title?: string; body?: string }>(request);
  const q = await createInquiry(getDb(), s.principal.userId, {
    title: String(b.title ?? ""),
    body: String(b.body ?? ""),
  });
  return NextResponse.json({ id: q.id });
});
