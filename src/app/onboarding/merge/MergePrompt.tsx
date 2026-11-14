"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Button, Card, Notice } from "@/components/ui";

interface Candidate {
  studentId: string;
  trainerName: string;
  workplace: string | null;
  passCount: number;
  bookingCount: number;
}

/** "이 트레이너의 수강생이 맞나요?" (1.4) */
export function MergePrompt() {
  const router = useRouter();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const then = useSearchParams().get("then");
  const next = () =>
    router.replace(
      then && then.startsWith("/l/") ? then : "/onboarding/notifications",
    );

  useEffect(() => {
    api<{ candidates: Candidate[] }>("/api/s/merge").then((r) => {
      if (r.ok) setList(r.data.candidates);
      else setError(r.message);
    });
  }, []);

  async function merge(studentId: string) {
    const r = await api("/api/s/merge", { body: { studentId } });
    if (r.ok) next();
    else setError(r.message);
  }

  if (!list) return error ? <Notice tone="error">{error}</Notice> : null;
  return (
    <div className="flex flex-col gap-4">
      {list.map((c) => (
        <Card
          key={c.studentId}
          title={`${c.trainerName} 트레이너의 수강생이 맞나요?`}
        >
          <p className="text-muted text-sm">
            {c.workplace && `${c.workplace} · `}이 전화번호로 등록된 기록이
            있습니다 (이용권 {c.passCount}개, 수업 {c.bookingCount}건). 맞으면
            기존 기록을 내 계정으로 합칩니다.
          </p>
          <Button onClick={() => merge(c.studentId)}>네, 맞아요</Button>
        </Card>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="secondary" onClick={next}>
        아니요
      </Button>
    </div>
  );
}
