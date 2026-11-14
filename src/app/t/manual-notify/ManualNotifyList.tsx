"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtRange } from "@/components/fmt";
import { KakaoShareButton } from "@/components/KakaoShareButton";
import { Card, EmptyState, Loading, Notice } from "@/components/ui";

interface Row {
  studentId: string;
  name: string;
  reason: string;
  items: (
    | {
        kind: "CONFIRM" | "APPROVE" | "REMIND";
        refId: string;
        startAt: string;
        endAt: string;
      }
    | { kind: "RULES"; refId: string; passName: string }
  )[];
}

/** 알림 못 받는 수강생 (8.4): 카톡 공유로 한 명씩 발송 */
export function ManualNotifyList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    api<{ students: Row[] }>("/api/t/manual-notify").then(
      (r) => r.ok && setRows(r.data.students),
    );
  }, []);
  if (!rows) return <Loading />;
  if (rows.length === 0)
    return (
      <Notice tone="success">모든 수강생이 알림을 받을 수 있습니다.</Notice>
    );
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <Card key={r.studentId} title={`${r.name} · ${r.reason}`}>
          {r.items.length === 0 && (
            <EmptyState icon="smile">보낼 항목이 없습니다. 🎉</EmptyState>
          )}
          {r.items.map((it) =>
            it.kind === "RULES" ? (
              <div key={it.refId} className="flex flex-col gap-1">
                <p className="text-sm">규칙 동의 요청 · {it.passName}</p>
                <KakaoShareButton purpose="RULE_CONSENT" refId={it.refId} />
              </div>
            ) : (
              <div key={it.refId} className="flex flex-col gap-1">
                <p className="text-sm">
                  {it.kind === "CONFIRM"
                    ? "확정 요청"
                    : it.kind === "APPROVE"
                      ? "완료 승인 요청"
                      : "수업 안내"}{" "}
                  · {fmtRange(it.startAt, it.endAt)}
                </p>
                {it.kind === "CONFIRM" && (
                  <KakaoShareButton
                    purpose="CONFIRM_BOOKING"
                    refId={it.refId}
                  />
                )}
                {it.kind === "APPROVE" && (
                  <KakaoShareButton purpose="APPROVE" refId={it.refId} />
                )}
                {it.kind === "REMIND" && (
                  <p className="text-muted text-xs">
                    수업 안내는 카톡 대화로 직접 알려 주세요.
                  </p>
                )}
              </div>
            ),
          )}
        </Card>
      ))}
    </div>
  );
}
