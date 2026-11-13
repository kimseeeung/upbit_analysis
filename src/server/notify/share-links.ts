import { createHash, randomBytes } from "node:crypto";
import type { ShareLinkPurpose } from "@/generated/prisma/client";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** 카톡 공유용 1회용 링크를 만든다. 토큰은 링크에만 있고 DB에는 해시만 */
export async function createShareLink(
  db: Db,
  input: {
    purpose: ShareLinkPurpose;
    refId: string;
    createdBy: string;
    expiresAt: Date;
  },
  now = new Date(),
) {
  const token = randomBytes(24).toString("base64url");
  await db.shareLink.create({
    data: {
      tokenHash: hash(token),
      purpose: input.purpose,
      refId: input.refId,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      createdAt: now,
    },
  });
  return token;
}

/** 유효한(만료·사용 전) 링크를 찾는다 */
export async function resolveShareLink(
  db: Db,
  token: string,
  purpose: ShareLinkPurpose,
  now = new Date(),
) {
  const link = await db.shareLink.findUnique({
    where: { tokenHash: hash(token) },
  });
  if (!link || link.purpose !== purpose)
    throw new AppError("LINK_INVALID", "잘못된 링크입니다", 404);
  if (link.usedAt)
    throw new AppError("LINK_USED", "이미 사용한 링크입니다", 410);
  if (link.expiresAt <= now)
    throw new AppError("LINK_EXPIRED", "만료된 링크입니다", 410);
  return link;
}

/** 한 번 쓰면 끝 */
export async function consumeShareLink(
  db: Db,
  linkId: string,
  now = new Date(),
) {
  const r = await db.shareLink.updateMany({
    where: { id: linkId, usedAt: null },
    data: { usedAt: now },
  });
  if (r.count !== 1)
    throw new AppError("LINK_USED", "이미 사용한 링크입니다", 410);
}

export function shareUrl(path: string): string {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}
