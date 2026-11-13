"use client";

import { useEffect, useState } from "react";

/** 롤백 중 사용자 화면에 "잠시 점검 중" (12.3-3). 1분마다 확인 */
export function MaintenanceBanner() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      // 운영 관리자 화면에는 띄우지 않는다
      if (window.location.pathname.startsWith("/admin"))
        return setMessage(null);
      try {
        const r = await fetch("/api/public/maintenance", { cache: "no-store" });
        const j = (await r.json()) as { on: boolean; message?: string };
        if (!stop)
          setMessage(j.on ? (j.message ?? "잠시 점검 중입니다") : null);
      } catch {
        /* 오프라인이면 표시하지 않음 */
      }
    };
    void check();
    const t = setInterval(check, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  if (!message) return null;
  return (
    <div
      role="status"
      className="bg-amber-500 px-4 py-1.5 text-center text-sm text-white"
    >
      {message}
    </div>
  );
}
