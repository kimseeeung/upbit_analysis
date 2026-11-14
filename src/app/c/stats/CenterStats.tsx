"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { PeriodPicker, monthRange } from "@/components/PeriodPicker";
import { Card, Notice, PageHeader, StatTile } from "@/components/ui";
import type { StatRow, StatSummary } from "@/lib/stats/stats";

interface Data {
  byTrainer: {
    trainerId: string;
    trainerName: string;
    rows: StatRow[];
    summary: StatSummary;
  }[];
  total: StatSummary;
}

/** 센터 수강 현황 (9.3): 트레이너별 또는 센터 합계, 수업 수·노쇼율 비교 */
export function CenterStats() {
  const [range, setRange] = useState(monthRange(0));
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Data>(`/api/c/stats?from=${range.from}&to=${range.to}`).then((r) =>
      r.ok ? setD(r.data) : setError(r.message),
    );
  }, [range]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="센터 수강 현황" />
      <PeriodPicker value={range} onChange={setRange} />
      {error && <Notice tone="error">{error}</Notice>}
      {d && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StatTile
              label="센터 총 수업"
              icon="calendar"
              value={`${d.total.totalClasses}회`}
            />
            <StatTile
              label="센터 노쇼율"
              icon="pause"
              value={`${(d.total.noShowRate * 100).toFixed(1)}%`}
            />
            <StatTile
              label="결제 합계"
              icon="card"
              value={`${d.total.paymentSum.toLocaleString("ko-KR")}원`}
            />
          </div>
          <Card
            title="트레이너별 현황"
            icon="dumbbell"
            count={d.byTrainer.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-line border-b text-left">
                    <th className="px-2 py-2">트레이너</th>
                    <th className="px-2 py-2">수업 수</th>
                    <th className="px-2 py-2">노쇼율</th>
                    <th className="px-2 py-2">결제</th>
                    <th className="px-2 py-2">수강생</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byTrainer.map((t) => (
                    <tr key={t.trainerId} className="border-line border-b">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            setOpen(open === t.trainerId ? null : t.trainerId)
                          }
                        >
                          {t.trainerName}
                        </button>
                      </td>
                      <td className="px-2 py-2">{t.summary.totalClasses}</td>
                      <td className="px-2 py-2">
                        {(t.summary.noShowRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-2">
                        {t.summary.paymentSum.toLocaleString("ko-KR")}원
                      </td>
                      <td className="px-2 py-2">{t.rows.length}명</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {open &&
            d.byTrainer
              .filter((t) => t.trainerId === open)
              .map((t) => (
                <Card key={t.trainerId} title={`${t.trainerName} 수강생`}>
                  {t.rows.map((r) => (
                    <p key={r.studentId} className="text-sm">
                      {r.name}: 수강 {r.completed} · 노쇼 {r.noShow} · 취소{" "}
                      {r.canceled} · 잔여 {r.remaining ?? "-"}
                    </p>
                  ))}
                </Card>
              ))}
          <p className="text-muted text-xs">
            소속 기간 안의 기록만 셉니다. 이동한 트레이너는 이동 전 기간만
            보입니다.
          </p>
        </>
      )}
    </div>
  );
}
