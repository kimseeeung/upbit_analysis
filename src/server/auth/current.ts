import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { getDb } from "@/lib/db";
import { resolveSession, type ResolvedSession } from "./session-service";

/** 현재 요청의 회원 세션. 한 요청 안에서는 한 번만 조회한다. */
export const getCurrentSession = cache(
  async (): Promise<ResolvedSession | null> => {
    // 로그인 상태는 요청마다 다르므로 프리렌더하지 않는다
    await connection();
    const store = await cookies();
    return resolveSession(getDb(), store.get(SESSION_COOKIE)?.value);
  },
);
