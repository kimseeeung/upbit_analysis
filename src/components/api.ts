"use client";

import { setOffline } from "@/lib/offline/network";

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };

/** 서버 API 호출. 실패하면 서버가 준 한국어 문구를 돌려준다. */
export async function api<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    // 서버 무응답·네트워크 끊김 (11.2)
    setOffline(true);
    return {
      ok: false,
      code: "NETWORK",
      message: "네트워크에 연결할 수 없습니다",
    };
  }
  setOffline(false);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      code: json?.error?.code ?? "ERROR",
      message: json?.error?.message ?? "잠시 후 다시 시도해 주세요",
      details: json?.error?.details,
    };
  }
  if (method !== "GET" && typeof window !== "undefined") {
    // 데이터가 바뀌면 바뀐 부분을 다시 백업 (11.1)
    window.dispatchEvent(new CustomEvent("pt:changed"));
  }
  return { ok: true, data: json as T };
}
