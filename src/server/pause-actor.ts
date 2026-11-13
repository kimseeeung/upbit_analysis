import type { ResolvedSession } from "@/server/auth/session-service";
import { ForbiddenError } from "@/lib/auth/access";

export function pauseActor(s: ResolvedSession) {
  if (s.principal.role === "TRAINER")
    return { role: "TRAINER" as const, userId: s.principal.userId };
  if (s.principal.role === "STUDENT")
    return { role: "STUDENT" as const, userId: s.principal.userId };
  throw new ForbiddenError();
}
