"use client";

import { useRouter } from "next/navigation";
import { clearOffline } from "@/lib/offline/store";
import { api } from "./api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-zinc-500"
      onClick={async () => {
        await api("/api/auth/logout", { body: {} });
        // 로그아웃하면 휴대폰 백업 삭제 (11.1)
        await clearOffline();
        router.replace("/login");
        router.refresh();
      }}
    >
      로그아웃
    </button>
  );
}
