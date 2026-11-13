import Link from "next/link";
import { DisplayToggle } from "@/components/DisplayToggle";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <DisplayToggle />
      <h1 className="text-2xl font-semibold">PT 관리</h1>
      <p className="text-sm text-zinc-500">
        트레이너와 수강생이 함께 쓰는 PT 일정·이용권 관리
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700"
        >
          회원가입
        </Link>
      </div>
    </main>
  );
}
