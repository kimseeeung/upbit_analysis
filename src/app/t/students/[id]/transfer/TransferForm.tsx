"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/api";
import { TrainerSearch, type TrainerHit } from "@/components/TrainerSearch";
import { Button, Card, Checkbox, Notice } from "@/components/ui";

/** 이전 트레이너의 인계 (7.2): 새 트레이너 수락 → 수강생 동의 → 완료 */
export function TransferForm({ studentId }: { studentId: string }) {
  const [pick, setPick] = useState<TrainerHit | null>(null);
  const [passAgree, setPassAgree] = useState(true);
  const [memo, setMemo] = useState(false);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/t/students/${studentId}`} className="text-muted text-sm">
        ← 수강생 상세
      </Link>
      <h1 className="text-lg font-semibold">담당 트레이너 인계</h1>
      <Card title="새 트레이너">
        {pick ? (
          <p className="text-sm">
            {pick.name} <span className="text-muted">· {pick.workplace}</span>{" "}
            <Button variant="ghost" onClick={() => setPick(null)}>
              바꾸기
            </Button>
          </p>
        ) : (
          <TrainerSearch onPick={setPick} />
        )}
      </Card>
      <Card title="넘기는 것">
        <Checkbox
          label="남은 이용권을 새 트레이너에게 넘기기 (넘기지 않으면 사용 중지로 남고 정산은 앱 밖에서)"
          checked={passAgree}
          onChange={setPassAgree}
        />
        <Checkbox
          label="트레이너 메모 넘기기"
          checked={memo}
          onChange={setMemo}
        />
        <p className="text-muted text-xs">
          예정 예약은 새 트레이너가 수락할 때 예약별로 유지·취소를 정합니다.
          수강 규칙은 새 트레이너 규칙으로 다시 동의를 받습니다.
        </p>
      </Card>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button
        disabled={!pick}
        onClick={async () => {
          const r = await api(`/api/t/students/${studentId}/transfer`, {
            body: { toTrainerId: pick!.id, passAgree, memoTransfer: memo },
          });
          setMsg(
            r.ok
              ? {
                  tone: "success",
                  text: "인계를 요청했습니다. 새 트레이너 수락과 수강생 동의 뒤 완료됩니다",
                }
              : { tone: "error", text: r.message },
          );
        }}
      >
        인계 요청
      </Button>
    </div>
  );
}
