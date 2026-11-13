import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { listNotices, saveNotice } from "@/server/admin/notice-service";

export const GET = route(async () => {
  await requireApiOperator();
  return NextResponse.json({ notices: await listNotices(getDb()) });
});

export const POST = route(async (request) => {
  const op = await requireApiOperator();
  const b = await readJson<{ id?: string; title?: string; body?: string }>(
    request,
  );
  const n = await saveNotice(getDb(), op.operatorId, {
    id: typeof b.id === "string" ? b.id : undefined,
    title: String(b.title ?? ""),
    body: String(b.body ?? ""),
  });
  return NextResponse.json({ notice: n });
});
