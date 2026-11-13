"use client";

import { useRouter } from "next/navigation";
import { api } from "./api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-zinc-500"
      onClick={async () => {
        await api("/api/auth/logout", { body: {} });
        router.replace("/login");
        router.refresh();
      }}
    >
      로그아웃
    </button>
  );
}
