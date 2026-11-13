import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentTerms } from "@/server/auth/terms-service";
import { route } from "@/server/http";

export const GET = route(async () => {
  const terms = await getCurrentTerms(getDb());
  return NextResponse.json({
    terms: terms.map((t) => ({
      kind: t.kind,
      version: t.version,
      title: t.title,
      required: t.required,
      body: t.body,
    })),
  });
});
