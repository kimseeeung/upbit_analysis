"use client";

import { useEffect } from "react";

/** 서비스 워커 등록, 알림을 눌러 연 경우(?n=) 확인 기록 */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const url = new URL(window.location.href);
    const n = url.searchParams.get("n");
    if (n) {
      fetch(`/api/notifications/${encodeURIComponent(n)}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
      url.searchParams.delete("n");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);
  return null;
}
