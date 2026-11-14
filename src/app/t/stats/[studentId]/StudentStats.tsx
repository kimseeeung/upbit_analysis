"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { APPROVAL_METHOD_LABEL } from "@/components/approval-types";
import { STATUS_STYLE, fmtDateTime, fmtRange } from "@/components/fmt";
import {
  BackLink,
  Card,
  EmptyState,
  Loading,
  Notice,
  PageHeader,
} from "@/components/ui";

interface Item {
  id: string;
  startAt: string;
  endAt: string;
  status: keyof typeof STATUS_STYLE;
  trainerName: string;
  approvedAt: string | null;
  approvalMethod: keyof typeof APPROVAL_METHOD_LABEL | null;
  disputed: boolean;
  lateCancel: boolean;
  deducted: boolean;
  memo: string | null;
}
interface Data {
  studentName: string;
  current: boolean;
  groups: { passId: string | null; passName: string; items: Item[] }[];
}

/** 수강생별 일자별 상세 (6장) */
export function StudentStats({ studentId }: { studentId: string }) {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Data>(`/api/t/stats/${studentId}?from=${from}&to=${to}`).then((r) =>
      r.ok ? setData(r.data) : setError(r.message),
    );
  }, [studentId, from, to]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/t/stats">수강 현황</BackLink>
      <PageHeader
        title={
          <>
            {data.studentName} · {from}~{to}
          </>
        }
      />
      {!data.current && (
        <Notice>이전 담당 수강생입니다. 직접 진행한 수업만 보입니다.</Notice>
      )}
      {data.groups.length === 0 && (
        <EmptyState icon="calendar">기간 안의 수업이 없습니다.</EmptyState>
      )}
      {data.groups.map((g) => (
        <Card key={g.passId ?? "none"} title={g.passName}>
          <ul className="divide-line flex flex-col divide-y text-sm">
            {g.items.map((b) => (
              <li key={b.id} className="flex flex-col py-2">
                <span>
                  {fmtRange(b.startAt, b.endAt)} ·{" "}
                  <b>{STATUS_STYLE[b.status].label}</b>
                  {b.lateCancel && " (당일 취소)"}
                  {b.disputed && (
                    <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-700">
                      이견 있음
                    </span>
                  )}
                </span>
                <span className="text-muted text-xs">
                  진행 {b.trainerName}
                  {b.approvedAt && ` · 승인 ${fmtDateTime(b.approvedAt)}`}
                  {b.approvalMethod &&
                    ` (${APPROVAL_METHOD_LABEL[b.approvalMethod]})`}
                  {b.memo && ` · 메모: ${b.memo}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
