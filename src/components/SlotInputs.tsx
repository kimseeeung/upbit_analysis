"use client";

import { isoToKstLocal, kstLocalToIso } from "./fmt";

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
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`${label} ${i + 1}`}
            type="datetime-local"
            step={1800}
            value={isoToKstLocal(s.startAt)}
            onChange={(e) => {
              if (!e.target.value) return;
              const start = kstLocalToIso(e.target.value);
              const end = new Date(
                new Date(start).getTime() + durationMs,
              ).toISOString();
              onChange(
                slots.map((x, j) =>
                  j === i ? { startAt: start, endAt: end } : x,
                ),
              );
            }}
            className="flex-1 rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {slots.length > 1 && (
            <button
              type="button"
              className="text-sm text-zinc-500"
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
          className="self-start text-sm text-zinc-500 underline"
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
