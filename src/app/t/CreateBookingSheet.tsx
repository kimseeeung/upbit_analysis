"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { readSnapshot } from "@/lib/offline/client";
import { enqueue } from "@/lib/offline/store";
import { isoToKstLocal, kstLocalToIso } from "@/components/fmt";
import { DateTimeSelect, DurationSelect } from "@/components/pickers";
import {
  Button,
  Checkbox,
  Modal,
  Notice,
  SELECT,
  TextField,
} from "@/components/ui";
import { DEFAULT_DURATION } from "@/lib/input/datetime";

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
  const [duration, setDuration] = useState(DEFAULT_DURATION);
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
      async (r) => {
        if (r.ok) return setStudents(r.data.students);
        const snap = await readSnapshot<{ students: StudentRow[] }>();
        if (snap) setStudents(snap.students);
      },
    );
  }, []);

  async function submit(acknowledgeWarnings: boolean) {
    setBusy(true);
    setError(null);
    const r = await api<CreateResult>("/api/t/bookings", {
      body: {
        studentId,
        startAt: kstLocalToIso(start),
        durationMinutes: duration,
        memo: memo || null,
        recurrence: repeat ? { weekdays, count: Number(count) } : null,
        acknowledgeWarnings,
      },
    });
    setBusy(false);
    if (!r.ok && r.code === "NETWORK") {
      // 오프라인: 휴대폰에 임시 저장 → 연결되면 동기화 (11.2). 반복 예약은 연결된 뒤에
      if (repeat)
        return setError("오프라인에서는 반복 예약을 만들 수 없습니다");
      await enqueue(
        {
          kind: "CREATE_BOOKING",
          payload: {
            studentId,
            startAt: kstLocalToIso(start),
            durationMinutes: duration,
            memo: memo || null,
            studentName: students.find((x) => x.studentId === studentId)?.name,
          },
        },
        "예약 등록",
      );
      return onCreated(
        "오프라인이라 휴대폰에 임시 저장했습니다 (동기화 대기). 연결되면 등록됩니다",
      );
    }
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
        <span className="font-semibold">수강생</span>
        <select
          aria-label="수강생"
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            setWarnings(null);
          }}
          className={SELECT}
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
      <DateTimeSelect
        label="시작 시각"
        value={start}
        onChange={(v) => {
          setStart(v);
          setWarnings(null);
        }}
      />
      <DurationSelect value={duration} onChange={setDuration} />
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
                className={`size-9 rounded-full text-sm font-semibold transition ${weekdays.includes(i) ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"}`}
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
