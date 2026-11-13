import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStudentDetailForTrainer } from "@/server/students/detail-service";
import {
  setStudentHidden,
  updateTrainerMemo,
} from "@/server/students/student-service";
import { readJson, requireApiSession, route } from "@/server/http";

type Ctx = RouteContext<"/api/t/students/[id]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const s = await requireApiSession(["TRAINER"]);
  const { id } = await ctx.params;
  return NextResponse.json(
    await getStudentDetailForTrainer(getDb(), s.principal.userId, id),
  );
});

export const PATCH = route<Ctx>(async (request, ctx) => {
  const s = await requireApiSession(["TRAINER"]);
  const { id } = await ctx.params;
  const b = await readJson<{ memo?: unknown; hidden?: unknown }>(request);
  const db = getDb();
  if (typeof b.memo === "string")
    await updateTrainerMemo(db, s.principal.userId, id, b.memo);
  if (typeof b.hidden === "boolean")
    await setStudentHidden(db, s.principal.userId, id, b.hidden);
  return NextResponse.json({ ok: true });
});
