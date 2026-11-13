"use client";

import { api, type ApiResult } from "@/components/api";
import { enqueue, getEncrypted } from "./store";

/** 휴대폰 백업 읽기 */
export async function readSnapshot<T>(): Promise<T | null> {
  return getEncrypted<T>("snapshot");
}

/**
 * 서버에 보내 보고, 연결이 없으면 휴대폰에 임시 저장해 "동기화 대기"로 둔다 (11.2).
 * 트레이너의 예약 등록·변경·취소, 노쇼 처리, 메모, 현장 완료 승인만.
 */
export async function apiOrQueue<T>(
  url: string,
  body: unknown,
  queued: { kind: string; payload: Record<string, unknown>; label: string },
): Promise<ApiResult<T | { queued: true }>> {
  const r = await api<T>(url, { body });
  if (!r.ok && r.code === "NETWORK") {
    await enqueue({ kind: queued.kind, payload: queued.payload }, queued.label);
    return { ok: true, data: { queued: true } };
  }
  return r;
}

export function isQueued(data: unknown): data is { queued: true } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { queued?: boolean }).queued === true
  );
}
