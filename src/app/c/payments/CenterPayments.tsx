"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { PeriodPicker, monthRange } from "@/components/PeriodPicker";
import { Card, Notice } from "@/components/ui";

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
      <h1 className="text-lg font-semibold">결제 기록</h1>
      <PeriodPicker value={range} onChange={setRange} />
      {error && <Notice tone="error">{error}</Notice>}
      {d && (
        <>
          <Card title={`합계 ${d.total.toLocaleString("ko-KR")}원`}>
            {d.byTrainer.map((t) => (
              <p key={t.trainerId} className="text-sm">
                {t.trainerName}: {t.count}건 ·{" "}
                {t.amount.toLocaleString("ko-KR")}원
              </p>
            ))}
          </Card>
          <a
            href={`/api/c/payments/csv?from=${range.from}&to=${range.to}`}
            className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            엑셀 다운로드
          </a>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
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
                  <tr
                    key={i.passId}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-2 py-2">{i.paidAt}</td>
                    <td className="px-2 py-2">{i.studentName}</td>
                    <td className="px-2 py-2">{i.trainerName}</td>
                    <td className="px-2 py-2">
                      {i.passName}
                      {i.status === "REFUNDED" && (
                        <span className="text-xs text-red-600"> 환불</span>
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
          <p className="text-xs text-zinc-500">
            앱은 결제 기록만 보관합니다. 판매 트레이너가 소속이던 기간의 결제만
            보입니다.
          </p>
        </>
      )}
    </div>
  );
}
