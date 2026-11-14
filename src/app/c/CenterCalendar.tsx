"use client";

import { DateSelect } from "@/components/pickers";
import type { DatesSetArg, EventInput } from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import dayGridPlugin from "@fullcalendar/daygrid";
import luxonPlugin from "@fullcalendar/luxon3";
import { useDisplayMode } from "@/lib/display";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/components/api";
import { STATUS_STYLE, fmtRange, kstDateKey } from "@/components/fmt";
import { Card, Notice } from "@/components/ui";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#4b5563",
];

interface Data {
  trainers: {
    id: string;
    name: string;
    colorIndex: number;
    current: boolean;
  }[];
  bookings: {
    id: string;
    trainerId: string;
    trainerName: string;
    studentName: string;
    startAt: string;
    endAt: string;
    status: keyof typeof STATUS_STYLE;
  }[];
}

/** 센터 캘린더 (9.3): 소속 트레이너 전체 일정, 트레이너별 색상·필터, 일 보기는 트레이너별 열 */
export function CenterCalendar() {
  const displayMode = useDisplayMode();
  const [data, setData] = useState<Data | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [day, setDay] = useState(kstDateKey(new Date()));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    const r = await api<Data>(`/api/c/calendar?from=${from}&to=${to}`);
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, []);
  const onDatesSet = useCallback(
    (arg: DatesSetArg) =>
      void load(
        kstDateKey(arg.start),
        kstDateKey(new Date(arg.end.getTime() - 1)),
      ),
    [load],
  );
  const color = (trainerId: string) =>
    COLORS[
      (data?.trainers.find((t) => t.id === trainerId)?.colorIndex ?? 0) %
        COLORS.length
    ];

  const events: EventInput[] = useMemo(
    () =>
      (data?.bookings ?? [])
        .filter((b) => !hidden.includes(b.trainerId))
        .map((b) => ({
          id: b.id,
          title: `${b.trainerName} · ${b.studentName} · ${STATUS_STYLE[b.status].label}`,
          start: b.startAt,
          end: b.endAt,
          backgroundColor: color(b.trainerId),
          borderColor: color(b.trainerId),
          classNames: b.status === "CANCELED" ? ["opacity-50"] : [],
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, hidden],
  );

  const columns = (data?.trainers ?? []).filter((t) => !hidden.includes(t.id));
  const dayBookings = (data?.bookings ?? []).filter(
    (b) => kstDateKey(b.startAt) === day,
  );
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">센터 캘린더</h1>
      {error && <Notice tone="error">{error}</Notice>}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="트레이너 필터"
      >
        {data?.trainers.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={!hidden.includes(t.id)}
            onClick={() =>
              setHidden((h) =>
                h.includes(t.id) ? h.filter((x) => x !== t.id) : [...h, t.id],
              )
            }
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm ${hidden.includes(t.id) ? "opacity-40" : ""}`}
          >
            <span
              className="inline-block size-3 rounded-full"
              style={{ background: COLORS[t.colorIndex % COLORS.length] }}
            />
            {t.name}
            {!t.current && (
              <span className="text-muted text-xs">(이전 소속)</span>
            )}
          </button>
        ))}
      </div>
      <div className="text-sm [&_.fc-button]:whitespace-nowrap [&_.fc-toolbar]:flex-wrap [&_.fc-toolbar]:gap-2 [&_.fc-toolbar-title]:text-base max-sm:[&_.fc-toolbar-title]:text-sm">
        <FullCalendar
          key={displayMode}
          plugins={[dayGridPlugin, timeGridPlugin, luxonPlugin, listPlugin]}
          timeZone="Asia/Seoul"
          locale={koLocale}
          initialView={
            displayMode === "MOBILE" ? "timeGridDay" : "timeGridWeek"
          }
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
          }}
          buttonText={{
            today: "오늘",
            month: "월",
            week: "주",
            day: "일",
            list: "목록",
          }}
          height={displayMode === "MOBILE" ? "72vh" : "78vh"}
          slotMinTime="00:00:00"
          scrollTime="07:00:00"
          allDaySlot={false}
          events={events}
          datesSet={onDatesSet}
          navLinks
          navLinkDayClick={(date) => setDay(kstDateKey(date))}
        />
      </div>
      <Card title={`일 보기 (트레이너별) · ${day}`}>
        <DateSelect label="날짜" value={day} onChange={(v) => setDay(v)} />
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(8rem, 1fr))`,
          }}
        >
          {columns.map((t) => (
            <div key={t.id} className="flex flex-col gap-1">
              <p
                className="text-sm font-medium"
                style={{ color: COLORS[t.colorIndex % COLORS.length] }}
              >
                {t.name}
              </p>
              {dayBookings
                .filter((b) => b.trainerId === t.id)
                .map((b) => (
                  <div
                    key={b.id}
                    className="bg-brand-50 dark:bg-brand-700/20 rounded border-l-4 px-2 py-1 text-xs"
                    style={{
                      borderColor: COLORS[t.colorIndex % COLORS.length],
                    }}
                  >
                    {fmtRange(b.startAt, b.endAt).split(" ").slice(1).join(" ")}{" "}
                    {b.studentName}
                    <span className="text-muted block">
                      {STATUS_STYLE[b.status].label}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
        <p className="text-muted text-xs">
          주 보기의 날짜를 누르거나 날짜를 바꾸면 그날의 트레이너별 일정이
          보입니다. 이 주에 불러온 일정만 표시합니다.
        </p>
      </Card>
    </div>
  );
}
