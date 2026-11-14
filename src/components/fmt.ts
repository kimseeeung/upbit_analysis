/** 화면 표시용 한국 시간 형식 (브라우저 시간대와 관계없이 Asia/Seoul) */

const TZ = "Asia/Seoul";
const WD = ["일", "월", "화", "수", "목", "금", "토"];

function parts(iso: string | Date) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const wdIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday"),
  );
  return {
    y: get("year"),
    m: String(Number(get("month"))),
    d: String(Number(get("day"))),
    hh: get("hour"),
    mm: get("minute"),
    wd: WD[wdIndex] ?? "",
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** 11/16(월) 19:00 */
export function fmtDateTime(iso: string | Date) {
  const p = parts(iso);
  return `${p.m}/${p.d}(${p.wd}) ${p.hh}:${p.mm}`;
}

/** 19:00 */
export function fmtTime(iso: string | Date) {
  const p = parts(iso);
  return `${p.hh}:${p.mm}`;
}

/** 11/16(월) 19:00~19:50 */
export function fmtRange(start: string | Date, end: string | Date) {
  return `${fmtDateTime(start)}~${fmtTime(end)}`;
}

/** 한국 날짜 키 YYYY-MM-DD */
export function kstDateKey(iso: string | Date) {
  return parts(iso).dateKey;
}

/** 한국 날짜·시각 문자열 → ISO (datetime-local 입력용) */
export function kstLocalToIso(local: string): string {
  // "2026-11-16T19:00" → +09:00
  return new Date(`${local}:00+09:00`).toISOString();
}

/** ISO → datetime-local 값 (한국 시간) */
export function isoToKstLocal(iso: string | Date): string {
  const p = parts(iso);
  return `${p.dateKey}T${p.hh}:${p.mm}`;
}

export const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: "신청 대기", color: "#ec4899" },
  PENDING_CONFIRM: { label: "확정 대기", color: "#f59e0b" },
  CONFIRMED: { label: "예약 확정", color: "#7c5cff" },
  PENDING_APPROVAL: { label: "완료 승인 대기", color: "#0d9488" },
  COMPLETED: { label: "완료", color: "#16a34a" },
  NO_SHOW: { label: "노쇼", color: "#dc2626" },
  CANCELED: { label: "취소", color: "#9ca3af" },
  REJECTED: { label: "거절됨", color: "#9ca3af" },
  EXPIRED: { label: "만료", color: "#9ca3af" },
  INSUFFICIENT: { label: "잔여 부족", color: "#6b7280" },
};
