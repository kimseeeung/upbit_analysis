import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { chooseDeparture } from "@/server/center/departure-service";
import { AppError } from "@/server/errors";
import { readJson, requireApiSession, route } from "@/server/http";

const CHOICES = ["FOLLOW", "STAY", "CENTER_ASSIGN", "FIND_OWN"] as const;

export const POST = route<RouteContext<"/api/s/departure-choices/[id]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ choice?: unknown }>(request);
    const choice = CHOICES.find((c) => c === b.choice);
    if (!choice) throw new AppError("INVALID", "선택해 주세요");
    await chooseDeparture(getDb(), {
      userId: s.principal.userId,
      choiceId: id,
      choice,
    });
    return NextResponse.json({ ok: true });
  },
);
