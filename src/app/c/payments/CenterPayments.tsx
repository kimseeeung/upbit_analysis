"use client";

import { Download } from "lucide-react";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { PeriodPicker, monthRange } from "@/components/PeriodPicker";
import { Card, Notice, PageHeader, StatTile } from "@/components/ui";

interface Data {
  items: {
    passId: string;
    paidAt: string;
    studentName: string;
    trainerName: string;
    passName: string;
    price: number;
    payMethod: string | null;
    status: string;
  }[];
  byTrainer: {
    trainerId: string;
    trainerName: string;
    count: number;
    amount: number;
  }[];
  total: number;
}

/** 결제 기록 (9.3): 기간별·트레이너별 합계, 엑셀 */
export function CenterPayments() {
  const [range, setRange] = useState(monthRange(0));
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Data>(`/api/c/payments?from=${range.from}&to=${range.to}`).then((r) =>
      r.ok ? setD(r.data) : setError(r.message),
    );
  }, [range]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="결제 기록" description="기간 안에 결제한 이용권">
        <a
          href={`/api/c/payments/csv?from=${range.from}&to=${range.to}`}
          className="border-line bg-surface hover:border-brand-300 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
        >
          <Download className="size-4" aria-hidden />
          엑셀 다운로드
        </a>
      </PageHeader>
      <PeriodPicker value={range} onChange={setRange} />
      {error && <Notice tone="error">{error}</Notice>}
      {d && (
        <>
          <StatTile
            label="결제 합계"
            icon="card"
            value={`${d.total.toLocaleString("ko-KR")}원`}
          />
          <Card
            title="트레이너별 합계"
            icon="dumbbell"
            count={d.byTrainer.length}
          >
            {d.byTrainer.map((t) => (
              <p key={t.trainerId} className="text-sm">
                {t.trainerName}: {t.count}건 ·{" "}
                {t.amount.toLocaleString("ko-KR")}원
              </p>
            ))}
          </Card>
          <Card title="결제 목록" icon="card" count={d.items.length}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-line border-b text-left">
                    <th className="px-2 py-2">결제일</th>
                    <th className="px-2 py-2">수강생</th>
                    <th className="px-2 py-2">판매 트레이너</th>
                    <th className="px-2 py-2">이용권</th>
                    <th className="px-2 py-2">금액</th>
                    <th className="px-2 py-2">수단</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.passId} className="border-line border-b">
                      <td className="px-2 py-2">{i.paidAt}</td>
                      <td className="px-2 py-2">{i.studentName}</td>
                      <td className="px-2 py-2">{i.trainerName}</td>
                      <td className="px-2 py-2">
                        {i.passName}
                        {i.status === "REFUNDED" && (
                          <span className="text-xs text-rose-600"> 환불</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {i.price.toLocaleString("ko-KR")}원
                      </td>
                      <td className="px-2 py-2">{i.payMethod ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-muted text-xs">
            앱은 결제 기록만 보관합니다. 판매 트레이너가 소속이던 기간의 결제만
            보입니다.
          </p>
        </>
      )}
    </div>
  );
}
