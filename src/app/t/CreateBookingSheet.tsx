"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { isoToKstLocal, kstLocalToIso } from "@/components/fmt";
import { Button, Checkbox, Modal, Notice, TextField } from "@/components/ui";

interface StudentRow {
  studentId: string;
  name: string;
  availableToday: number;
  ruleUnagreed: boolean;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

type CreateResult =
  | { needsConfirmation: true; warnings: { code: string; text: string }[] }
  | {
      needsConfirmation: false;
      created: string[];
      skippedInsufficient: number;
      skippedConflict: number;
    };

/** 예약 등록 (4.4) */
export function CreateBookingSheet({
  initialStart,
  onClose,
  onCreated,
}: {
  initialStart: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentId, setStudentId] = useState("");
  const [start, setStart] = useState(isoToKstLocal(initialStart));
  const [duration, setDuration] = useState("");
  const [memo, setMemo] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>(() => [
    new Date(new Date(initialStart).getTime() + 9 * 3600_000).getUTCDay(),
  ]);
  const [count, setCount] = useState("8");
  const [warnings, setWarnings] = useState<
    { code: string; text: string }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ students: StudentRow[] }>("/api/t/students?filter=ALL").then(
      (r) => r.ok && setStudents(r.data.students),
    );
  }, []);

  async function submit(acknowledgeWarnings: boolean) {
    setBusy(true);
    setError(null);
    const r = await api<CreateResult>("/api/t/bookings", {
      body: {
        studentId,
        startAt: kstLocalToIso(start),
        durationMinutes: duration ? Number(duration) : undefined,
        memo: memo || null,
        recurrence: repeat ? { weekdays, count: Number(count) } : null,
        acknowledgeWarnings,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (r.data.needsConfirmation) return setWarnings(r.data.warnings);
    const parts = [
      `예약 ${r.data.created.length}건을 등록하고 확정 요청을 보냈습니다`,
    ];
    if (r.data.skippedInsufficient)
      parts.push(
        `${r.data.skippedInsufficient}건은 잔여 부족으로 만들지 않았습니다`,
      );
    if (r.data.skippedConflict)
      parts.push(
        `${r.data.skippedConflict}건은 다른 수업과 겹쳐 만들지 않았습니다`,
      );
    onCreated(parts.join(". "));
  }

  const chosen = students.find((s) => s.studentId === studentId);

  return (
    <Modal title="예약 등록" onClose={onClose}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">수강생</span>
        <select
          aria-label="수강생"
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            setWarnings(null);
          }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">선택해 주세요</option>
          {students.map((s) => (
            <option key={s.studentId} value={s.studentId}>
              {s.name} (예약 가능 {s.availableToday}회
              {s.ruleUnagreed ? ", 규칙 미동의" : ""})
            </option>
          ))}
        </select>
      </label>
      {chosen && chosen.availableToday === 0 && (
        <Notice tone="warning">
          예약 가능 횟수가 없습니다. 이용권을 추가해 주세요.
        </Notice>
      )}
      <TextField
        label="시작 시각"
        type="datetime-local"
        step={1800}
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
          setWarnings(null);
        }}
      />
      <TextField
        label="수업 시간 (분)"
        type="number"
        placeholder="이용권 기본값"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      />
      <TextField
        label="메모"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />
      <Checkbox label="반복 예약" checked={repeat} onChange={setRepeat} />
      {repeat && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1" role="group" aria-label="반복 요일">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={weekdays.includes(i)}
                onClick={() =>
                  setWeekdays((w) =>
                    w.includes(i) ? w.filter((x) => x !== i) : [...w, i],
                  )
                }
                className={`size-9 rounded-full text-sm ${weekdays.includes(i) ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
              >
                {d}
              </button>
            ))}
          </div>
          <TextField
            label="횟수"
            type="number"
            min={1}
            max={52}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
      )}
      {warnings && (
        <Notice tone="warning">
          <ul className="list-disc pl-4">
            {warnings.map((w) => (
              <li key={w.code}>{w.text}</li>
            ))}
          </ul>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {warnings ? (
        <Button disabled={busy} onClick={() => submit(true)}>
          그래도 등록
        </Button>
      ) : (
        <Button
          disabled={busy || !studentId || !start}
          onClick={() => submit(false)}
        >
          등록하고 확정 요청 보내기
        </Button>
      )}
    </Modal>
  );
}
