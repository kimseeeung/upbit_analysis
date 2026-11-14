"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearOffline } from "@/lib/offline/store";
import { api } from "./api";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="로그아웃"
      title="로그아웃"
      className={`text-muted hover:bg-brand-50 hover:text-foreground dark:hover:bg-brand-700/20 inline-flex items-center gap-1 rounded-full ${compact ? "border-line size-9 justify-center border" : "px-2 py-1"}`}
      onClick={async () => {
        await api("/api/auth/logout", { body: {} });
        // 로그아웃하면 휴대폰 백업 삭제 (11.1)
        await clearOffline();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut className="size-4" aria-hidden />
      {!compact && "로그아웃"}
    </button>
  );
}
