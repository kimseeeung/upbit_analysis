"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { Card, TextField } from "@/components/ui";
import {
  sortRows,
  type SortKey,
  type StatRow,
  type StatSummary,
} from "@/lib/stats/stats";

function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
function monthRange(offset: number) {
  const t = kstToday();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7)) - 1 + offset;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}
function yearRange() {
  const y = kstToday().slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "수강생" },
  { key: "totalPt", label: "전체 PT" },
  { key: "completed", label: "수강" },
  { key: "noShow", label: "노쇼" },
  { key: "canceled", label: "취소" },
  { key: "pendingApproval", label: "승인 대기" },
  { key: "remaining", label: "잔여" },
  { key: "expiry", label: "만료일" },
];

/** 수강 현황 (6장): 기간 표, 검색·필터·정렬, 요약 카드, 엑셀 */
export function StatsTable() {
  const [range, setRange] = useState(monthRange(0));
  const [data, setData] = useState<{
    rows: StatRow[];
    summary: StatSummary;
  } | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | "CURRENT" | "PAST">("ALL");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  const load = useCallback(async () => {
    const r = await api<{ rows: StatRow[]; summary: StatSummary }>(
      `/api/t/stats?from=${range.from}&to=${range.to}`,
    );
    if (r.ok) setData(r.data);
  }, [range]);
  useEffect(() => {
    // 기간이 바뀌면 다시 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter(
      (r) =>
        r.name.includes(q.trim()) &&
        (filter === "ALL" ||
          (filter === "CURRENT" ? r.isCurrent : !r.isCurrent)),
    );
    return sortRows(list, sort.key, sort.dir);
  }, [data, q, filter, sort]);

  const s = data?.summary;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">수강 현황</h1>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="시작일"
          type="date"
          value={range.from}
          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
        />
        <TextField
          label="종료일"
          type="date"
          value={range.to}
          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
        />
        <div className="flex gap-1">
          {[
            ["이번 달", monthRange(0)],
            ["지난 달", monthRange(-1)],
            ["올해", yearRange()],
          ].map(([label, r]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => setRange(r as { from: string; to: string })}
              className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>
      {s && (
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <p className="text-xs text-zinc-500">총 수업 수</p>
            <p className="text-lg font-semibold">{s.totalClasses}회</p>
          </Card>
          <Card>
            <p className="text-xs text-zinc-500">노쇼율</p>
            <p className="text-lg font-semibold">
              {(s.noShowRate * 100).toFixed(1)}%
            </p>
          </Card>
          <Card>
            <p className="text-xs text-zinc-500">결제 합계</p>
            <p className="text-lg font-semibold">
              {s.paymentSum.toLocaleString("ko-KR")}원
            </p>
          </Card>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          className="flex-1"
          label="이름 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="상태"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="ALL">전체</option>
          <option value="CURRENT">지금 담당</option>
          <option value="PAST">이전 담당 (진행한 수업만)</option>
        </select>
        <a
          href={`/api/t/stats/csv?from=${range.from}&to=${range.to}`}
          className="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700"
        >
          엑셀 다운로드
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() =>
                      setSort((x) => ({
                        key: c.key,
                        dir:
                          x.key === c.key && x.dir === "asc" ? "desc" : "asc",
                      }))
                    }
                  >
                    {c.label}
                    {sort.key === c.key
                      ? sort.dir === "asc"
                        ? " ▲"
                        : " ▼"
                      : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.studentId}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-2 py-2">
                  <Link
                    className="underline"
                    href={`/t/stats/${r.studentId}?from=${range.from}&to=${range.to}`}
                  >
                    {r.name}
                  </Link>
                  {!r.isCurrent && (
                    <span className="ml-1 text-xs text-zinc-500">
                      이전 담당
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">{r.totalPt ?? "-"}</td>
                <td className="px-2 py-2">{r.completed}</td>
                <td className="px-2 py-2">{r.noShow}</td>
                <td className="px-2 py-2">
                  {r.canceled}
                  {r.lateCanceled > 0 && (
                    <span className="text-xs text-zinc-500">
                      {" "}
                      (당일 {r.lateCanceled})
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">{r.pendingApproval}</td>
                <td className="px-2 py-2">{r.remaining ?? "-"}</td>
                <td
                  className={`px-2 py-2 ${r.expirySoon ? "font-semibold text-red-600" : ""}`}
                >
                  {r.expiry ?? "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-2 py-6 text-center text-zinc-500"
                >
                  조회 기간에 해당하는 수강생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        인계된 수강생의 수강·노쇼·취소는 수업을 진행한 트레이너에게, 전체·잔여는
        조회 종료일 기준 담당 트레이너에게 셉니다.
      </p>
    </div>
  );
}
