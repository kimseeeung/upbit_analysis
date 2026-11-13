"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Notice } from "@/components/ui";

/** "탈퇴를 취소할까요?" (2.4) */
export function CancelWithdraw() {
  const router = useRouter();
  const [info, setInfo] = useState<{
    status: string;
    deleteScheduledAt: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ status: string; deleteScheduledAt: string | null }>(
      "/api/me/withdraw/cancel",
    ).then((r) => (r.ok ? setInfo(r.data) : setError(r.message)));
  }, []);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!info) return null;
  if (info.status !== "WITHDRAWING") {
    return <Button onClick={() => router.replace("/")}>처음으로</Button>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        탈퇴를 신청한 계정입니다.{" "}
        {info.deleteScheduledAt &&
          `${fmtDateTime(info.deleteScheduledAt)}에 개인정보와 기록이 삭제됩니다.`}
      </p>
      <Notice tone="warning">
        탈퇴를 취소해도 취소된 예약은 복구되지 않습니다.
      </Notice>
      <Button
        onClick={async () => {
          const r = await api<{ next: string }>("/api/me/withdraw/cancel", {
            body: {},
          });
          if (r.ok) {
            router.replace(r.data.next);
            router.refresh();
          } else setError(r.message);
        }}
      >
        탈퇴 취소하기
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          await api("/api/auth/logout", { body: {} });
          router.replace("/");
        }}
      >
        그대로 두고 로그아웃
      </Button>
    </div>
  );
}
