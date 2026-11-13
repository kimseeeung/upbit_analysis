"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { TextField } from "./ui";

export interface TrainerHit {
  id: string;
  name: string;
  workplace: string;
}

/** 트레이너 이름 검색 (근무지와 함께) */
export function TrainerSearch({
  onPick,
  excludeId,
}: {
  onPick: (t: TrainerHit) => void;
  excludeId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TrainerHit[]>([]);
  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      api<{ trainers: TrainerHit[] }>(
        `/api/public/trainers?q=${encodeURIComponent(q)}`,
      ).then((r) => r.ok && setHits(r.data.trainers));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="flex flex-col gap-1">
      <TextField
        label="트레이너 이름"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {q.trim() &&
          hits
            .filter((h) => h.id !== excludeId)
            .map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="w-full py-2 text-left text-sm"
                  onClick={() => onPick(h)}
                >
                  {h.name}
                  <span className="block text-xs text-zinc-500">
                    {h.workplace}
                  </span>
                </button>
              </li>
            ))}
      </ul>
    </div>
  );
}
