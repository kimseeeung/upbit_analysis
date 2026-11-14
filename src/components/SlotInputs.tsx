"use client";

import { isoToKstLocal, kstLocalToIso } from "./fmt";
import { DateTimeSelect } from "./pickers";

export interface Slot {
  startAt: string;
  endAt: string;
}

/** 1~3개 시간 입력 (다른 시간 제안, 변경 요청). 길이는 원래 수업 길이 */
export function SlotInputs({
  slots,
  onChange,
  durationMs,
  max = 3,
  label = "시간",
}: {
  slots: Slot[];
  onChange: (s: Slot[]) => void;
  durationMs: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {slots.map((s, i) => (
        <div key={i} className="flex items-end gap-2">
          <DateTimeSelect
            className="flex-1"
            label={`${label} ${i + 1}`}
            value={isoToKstLocal(s.startAt)}
            onChange={(v) => {
              const start = kstLocalToIso(v);
              const end = new Date(
                new Date(start).getTime() + durationMs,
              ).toISOString();
              onChange(
                slots.map((x, j) =>
                  j === i ? { startAt: start, endAt: end } : x,
                ),
              );
            }}
          />
          {slots.length > 1 && (
            <button
              type="button"
              className="text-muted text-sm"
              onClick={() => onChange(slots.filter((_, j) => j !== i))}
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {slots.length < max && (
        <button
          type="button"
          className="text-muted self-start text-sm underline"
          onClick={() => {
            const last = slots.at(-1);
            const start = new Date(
              new Date(last?.startAt ?? Date.now()).getTime() + 24 * 3600_000,
            ).toISOString();
            onChange([
              ...slots,
              {
                startAt: start,
                endAt: new Date(
                  new Date(start).getTime() + durationMs,
                ).toISOString(),
              },
            ]);
          }}
        >
          + {label} 추가
        </button>
      )}
    </div>
  );
}
