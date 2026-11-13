import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { searchMembers } from "@/server/admin/member-admin-service";

export const GET = route(async (request) => {
  await requireApiOperator();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ users: await searchMembers(getDb(), q) });
});
