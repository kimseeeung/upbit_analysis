import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { listInquiriesForAdmin } from "@/server/admin/notice-service";

export const GET = route(async (request) => {
  await requireApiOperator();
  const unanswered =
    new URL(request.url).searchParams.get("unanswered") === "1";
  return NextResponse.json({
    inquiries: await listInquiriesForAdmin(getDb(), { unanswered }),
  });
});
