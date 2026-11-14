import { CalendarCheck, Dumbbell, Smile, Ticket } from "lucide-react";
import Link from "next/link";
import { DisplayToggle } from "@/components/DisplayToggle";

const FEATURES = [
  {
    icon: CalendarCheck,
    text: "예약·확정을 한 캘린더에서",
    tone: "bg-brand-100 text-brand-600",
  },
  {
    icon: Ticket,
    text: "남은 횟수는 자동 계산",
    tone: "bg-pink-100 text-pink-600",
  },
  {
    icon: Smile,
    text: "수업 끝나면 PIN으로 간단 승인",
    tone: "bg-amber-100 text-amber-600",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-5 py-14 text-center">
      <DisplayToggle />
      <div className="flex flex-col items-center gap-3">
        <span className="from-brand-400 shadow-brand-500/30 inline-flex size-20 items-center justify-center rounded-[28px] bg-gradient-to-br to-pink-400 text-white shadow-lg">
          <Dumbbell className="size-10" strokeWidth={2.2} aria-hidden />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">PT 관리</h1>
        <p className="text-muted text-sm">
          트레이너와 수강생이 함께 쓰는 PT 일정·이용권 관리
        </p>
      </div>
      <ul className="flex w-full flex-col gap-2 text-left text-sm">
        {FEATURES.map(({ icon: Icon, text, tone }) => (
          <li
            key={text}
            className="border-line bg-surface flex items-center gap-3 rounded-2xl border px-4 py-3"
          >
            <span
              className={`inline-flex size-9 items-center justify-center rounded-full ${tone}`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <div className="flex w-full flex-col gap-2">
        <Link
          href="/login"
          className="bg-brand-500 shadow-brand-500/30 hover:bg-brand-600 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="border-line bg-surface hover:border-brand-300 rounded-xl border px-4 py-3 text-sm font-semibold"
        >
          회원가입
        </Link>
      </div>
    </main>
  );
}
