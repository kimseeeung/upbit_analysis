"use client";

import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export function AdminLogout() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-zinc-500"
      onClick={async () => {
        await api("/api/admin/logout", { body: {} });
        router.replace("/admin/login");
      }}
    >
      로그아웃
    </button>
  );
}
