"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { APPROVAL_METHOD_LABEL } from "@/components/approval-types";
import { STATUS_STYLE, fmtDateTime, fmtRange } from "@/components/fmt";
import { Card, Notice } from "@/components/ui";

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
  if (!data) return <p className="text-sm text-zinc-500">불러오는 중…</p>;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/t/stats" className="text-sm text-zinc-500">
        ← 수강 현황
      </Link>
      <h1 className="text-lg font-semibold">
        {data.studentName} · {from}~{to}
      </h1>
      {!data.current && (
        <Notice>이전 담당 수강생입니다. 직접 진행한 수업만 보입니다.</Notice>
      )}
      {data.groups.length === 0 && (
        <p className="text-sm text-zinc-500">기간 안의 수업이 없습니다.</p>
      )}
      {data.groups.map((g) => (
        <Card key={g.passId ?? "none"} title={g.passName}>
          <ul className="flex flex-col divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
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
                <span className="text-xs text-zinc-500">
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
