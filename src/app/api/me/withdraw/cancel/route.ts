import { NextResponse } from "next/server";
import { homePathFor } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { cancelWithdraw } from "@/server/account/withdraw-service";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(undefined, { allowWithdrawing: true });
  const u = await getDb().user.findUniqueOrThrow({
    where: { id: s.principal.userId },
    select: { status: true, deleteScheduledAt: true },
  });
  return NextResponse.json({
    status: u.status,
    deleteScheduledAt: u.deleteScheduledAt?.toISOString() ?? null,
  });
});

/** 5일 안에 로그인해 탈퇴 취소 */
export const POST = route(async () => {
  const s = await requireApiSession(undefined, { allowWithdrawing: true });
  await cancelWithdraw(getDb(), s.principal.userId);
  return NextResponse.json({ ok: true, next: homePathFor(s.principal) });
});
