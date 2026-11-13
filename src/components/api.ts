"use client";

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
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false,
      code: "NETWORK",
      message: "네트워크에 연결할 수 없습니다",
    };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      code: json?.error?.code ?? "ERROR",
      message: json?.error?.message ?? "잠시 후 다시 시도해 주세요",
      details: json?.error?.details,
    };
  }
  return { ok: true, data: json as T };
}
