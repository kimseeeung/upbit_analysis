"use client";

import { useEffect, useState } from "react";

/** 서버 무응답·네트워크 끊김 감지 (11.2) */
let offline = typeof navigator !== "undefined" ? !navigator.onLine : false;
const listeners = new Set<(v: boolean) => void>();

export function setOffline(v: boolean) {
  if (offline === v) return;
  offline = v;
  listeners.forEach((l) => l(v));
}

export function isOffline() {
  return offline;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => setOffline(false));
  window.addEventListener("offline", () => setOffline(true));
}

export function useOffline(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    // 브라우저에서만 알 수 있다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(offline);
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

export const OFFLINE_DISABLED =
  "오프라인에서는 할 수 없습니다. 연결되면 다시 시도해 주세요";
