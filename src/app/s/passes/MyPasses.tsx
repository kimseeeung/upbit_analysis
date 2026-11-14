"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { readSnapshot } from "@/lib/offline/client";
import { PassSummary, type PassView } from "@/components/PassCards";
import { PausePanel } from "@/components/PausePanel";
import { EmptyState, Loading, Notice, SectionTitle } from "@/components/ui";

export function MyPasses() {
  const [data, setData] = useState<{
    availableToday: number;
    passes: PassView[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ availableToday: number; passes: PassView[] }>("/api/s/passes").then(
      (r) => {
        if (r.ok) return setData(r.data);
        if (r.code === "NETWORK") {
          void readSnapshot<{
            passes: { availableToday: number; passes: PassView[] };
          }>().then((snap) =>
            snap ? setData(snap.passes) : setError(r.message),
          );
          return;
        }
        setError(r.message);
      },
    );
  }, []);
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const current = data.passes.filter(
    (p) => p.status === "ACTIVE" || p.status === "PAUSED",
  );
  const past = data.passes.filter(
    (p) => !(p.status === "ACTIVE" || p.status === "PAUSED"),
  );
  return (
    <div className="flex flex-col gap-4">
      {data.passes.length === 0 && (
        <EmptyState icon="ticket">등록된 이용권이 없습니다.</EmptyState>
      )}
      {current.length > 0 && (
        <SectionTitle
          title="사용 중인 이용권"
          icon="ticket"
          count={current.length}
        />
      )}
      {current.map((p) => (
        <PassSummary key={p.id} p={p}>
          <PausePanel passId={p.id} role="STUDENT" />
        </PassSummary>
      ))}
      {past.length > 0 && (
        <>
          <SectionTitle
            title="지난 이용권"
            icon="history"
            count={past.length}
          />
          {past.map((p) => (
            <PassSummary key={p.id} p={p} />
          ))}
        </>
      )}
    </div>
  );
}
