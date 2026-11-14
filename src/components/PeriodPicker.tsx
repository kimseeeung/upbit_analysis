"use client";

import { FilterBar } from "./ui";

import { DateSelect } from "@/components/pickers";

export function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
export function monthRange(offset = 0) {
  const t = kstToday();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7)) - 1 + offset;
  return {
    from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
  };
}
export function yearRange() {
  const y = kstToday().slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** 조회 기간: 시작일~종료일 + 이번 달·지난 달·올해 */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: { from: string; to: string };
  onChange: (v: { from: string; to: string }) => void;
}) {
  return (
    <FilterBar title="조회 기간">
      <div className="flex flex-wrap items-end gap-3">
        <DateSelect
          label="시작일"
          value={value.from}
          onChange={(v) => onChange({ ...value, from: v })}
        />
        <DateSelect
          label="종료일"
          value={value.to}
          onChange={(v) => onChange({ ...value, to: v })}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["이번 달", monthRange(0)],
            ["지난 달", monthRange(-1)],
            ["올해", yearRange()],
          ] as const
        ).map(([label, r]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(r)}
            className="bg-fill hover:bg-line rounded-full px-3.5 py-1.5 text-sm font-semibold"
          >
            {label}
          </button>
        ))}
      </div>
    </FilterBar>
  );
}
