import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondTimeChange } from "@/server/bookings/booking-service";
import { asSlots } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

/** 변경 요청 응답: 수락 / 거절 / 다른 시간 제안 */
export const POST = route<RouteContext<"/api/bookings/change-requests/[id]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER", "STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{
      action?: unknown;
      index?: unknown;
      slots?: unknown;
    }>(request);
    const action =
      b.action === "REJECT"
        ? "REJECT"
        : b.action === "COUNTER"
          ? "COUNTER"
          : "ACCEPT";
    await respondTimeChange(getDb(), {
      actorUserId: s.principal.userId,
      role: s.principal.role === "TRAINER" ? "TRAINER" : "STUDENT",
      requestId: id,
      action,
      index: Number(b.index) || 0,
      slots: action === "COUNTER" ? asSlots(b.slots) : undefined,
    });
    return NextResponse.json({ ok: true });
  },
);
