import { NextResponse } from "next/server";
import { homePathFor } from "@/lib/auth/access";
import { deviceLabelFromUserAgent } from "@/lib/auth/session-rules";
import { getDb } from "@/lib/db";
import { login } from "@/server/auth/login-service";
import { getTermsNeedingReconsent } from "@/server/auth/terms-service";
import { readJson, route, setSessionCookies } from "@/server/http";
import { asRole, asString } from "@/server/validate";

export const POST = route(async (request) => {
  const body = await readJson<Record<string, unknown>>(request);
  const db = getDb();
  const r = await login(db, {
    role: asRole(body.role),
    loginId: asString(body.loginId, "아이디"),
    password: asString(body.password, "비밀번호"),
    remember: body.remember === true,
    deviceLabel: deviceLabelFromUserAgent(request.headers.get("user-agent")),
  });
  const needsReconsent =
    (await getTermsNeedingReconsent(db, r.userId)).length > 0;
  const home = homePathFor({
    kind: "user",
    userId: r.userId,
    role: r.role,
    hasCenterAdmin: false,
  });
  const user = await db.user.findUniqueOrThrow({
    where: { id: r.userId },
    select: { status: true },
  });
  const res = NextResponse.json({
    ok: true,
    next:
      user.status === "WITHDRAWING"
        ? "/withdraw/cancel"
        : needsReconsent
          ? "/terms/reconsent"
          : home,
  });
  setSessionCookies(res, r.token, r.persistent);
  return res;
});
