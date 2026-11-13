import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { readJson, requireApiSession, route } from "@/server/http";

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export const POST = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<Body>(request);
  const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
  const p256dh = typeof b.keys?.p256dh === "string" ? b.keys.p256dh : "";
  const auth = typeof b.keys?.auth === "string" ? b.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth)
    throw new AppError("INVALID", "알림 구독 정보가 올바르지 않습니다");
  await getDb().pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: s.principal.userId,
      p256dh,
      auth,
      failedAt: null,
      userAgent: request.headers.get("user-agent"),
    },
    create: {
      userId: s.principal.userId,
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
    },
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<Body>(request);
  if (typeof b.endpoint === "string") {
    await getDb().pushSubscription.deleteMany({
      where: { endpoint: b.endpoint, userId: s.principal.userId },
    });
  }
  return NextResponse.json({ ok: true });
});
