"use client";

import { TextField } from "./ui";

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
    <div className="flex flex-wrap items-end gap-2">
      <TextField
        label="시작일"
        type="date"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
      />
      <TextField
        label="종료일"
        type="date"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
      />
      <div className="flex gap-1">
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
            className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
