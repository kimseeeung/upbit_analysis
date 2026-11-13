import { NextResponse } from "next/server";
import type { ShareLinkPurpose } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { readJson, requireApiSession, route } from "@/server/http";
import { createShareForTrainer } from "@/server/notify/link-actions";

const PURPOSES: ShareLinkPurpose[] = [
  "CONFIRM_BOOKING",
  "APPROVE",
  "RULE_CONSENT",
  "LINK_REQUEST",
];

/** "카톡으로 보내기": 1회용 링크와 보낼 문장을 만든다 */
export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ purpose?: unknown; refId?: unknown }>(request);
  const purpose = b.purpose as ShareLinkPurpose;
  if (!PURPOSES.includes(purpose) || typeof b.refId !== "string")
    throw new AppError("INVALID", "잘못된 요청입니다");
  return NextResponse.json(
    await createShareForTrainer(getDb(), {
      trainerId: s.principal.userId,
      purpose,
      refId: b.refId,
    }),
  );
});
