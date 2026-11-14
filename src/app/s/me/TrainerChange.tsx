"use client";

import { useState } from "react";
import { api } from "@/components/api";
import { TrainerSearch, type TrainerHit } from "@/components/TrainerSearch";
import { Button, Card, Notice } from "@/components/ui";

/** 수강생: 트레이너 변경 (7.2) — 새 트레이너 수락으로 완료, 이용권은 이전 트레이너 동의가 있어야 넘어감 */
export function TrainerChange() {
  const [pick, setPick] = useState<TrainerHit | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  return (
    <Card title="담당 트레이너 변경">
      <p className="text-muted text-xs">
        새 트레이너가 수락하면 바뀝니다. 계정·이용권·이력은 그대로 이어지고,
        남은 이용권은 이전 트레이너가 넘기기에 동의해야 새 트레이너와 쓸 수
        있습니다.
      </p>
      {pick ? (
        <div className="flex items-center justify-between text-sm">
          <span>
            {pick.name} <span className="text-muted">· {pick.workplace}</span>
          </span>
          <Button
            onClick={async () => {
              const r = await api("/api/s/transfer", {
                body: { toTrainerId: pick.id },
              });
              setMsg(
                r.ok
                  ? { tone: "success", text: "트레이너 변경을 요청했습니다" }
                  : { tone: "error", text: r.message },
              );
            }}
          >
            변경 요청
          </Button>
        </div>
      ) : (
        <TrainerSearch onPick={setPick} />
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </Card>
  );
}
