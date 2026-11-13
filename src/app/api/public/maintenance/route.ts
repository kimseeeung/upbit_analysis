import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { getMaintenance } from "@/server/admin/version-service";

/** 사용자 화면의 "잠시 점검 중" 표시 */
export const GET = route(async () => {
  return NextResponse.json(await getMaintenance(getDb()));
});
