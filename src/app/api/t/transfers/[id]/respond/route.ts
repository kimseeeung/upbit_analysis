import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondTransferAsNewTrainer } from "@/server/center/transfer-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/transfers/[id]/respond">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{
      accept?: unknown;
      bookingDecisions?: Record<string, "KEEP" | "CANCEL">;
    }>(request);
    await respondTransferAsNewTrainer(getDb(), {
      trainerId: s.principal.userId,
      transferId: id,
      accept: b.accept === true,
      bookingDecisions: b.bookingDecisions,
    });
    return NextResponse.json({ ok: true });
  },
);
