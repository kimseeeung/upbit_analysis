"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { PassSummary, type PassView } from "@/components/PassCards";
import { PausePanel } from "@/components/PausePanel";
import { Notice } from "@/components/ui";

export function MyPasses() {
  const [data, setData] = useState<{
    availableToday: number;
    passes: PassView[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ availableToday: number; passes: PassView[] }>("/api/s/passes").then(
      (r) => {
        if (r.ok) setData(r.data);
        else setError(r.message);
      },
    );
  }, []);
  if (!data)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <p className="text-sm text-zinc-500">불러오는 중…</p>
    );
  const current = data.passes.filter(
    (p) => p.status === "ACTIVE" || p.status === "PAUSED",
  );
  const past = data.passes.filter(
    (p) => !(p.status === "ACTIVE" || p.status === "PAUSED"),
  );
  return (
    <div className="flex flex-col gap-4">
      {data.passes.length === 0 && (
        <p className="text-sm text-zinc-500">등록된 이용권이 없습니다.</p>
      )}
      {current.map((p) => (
        <PassSummary key={p.id} p={p}>
          <PausePanel passId={p.id} role="STUDENT" />
        </PassSummary>
      ))}
      {past.length > 0 && (
        <>
          <h2 className="font-semibold">지난 이용권</h2>
          {past.map((p) => (
            <PassSummary key={p.id} p={p} />
          ))}
        </>
      )}
    </div>
  );
}
