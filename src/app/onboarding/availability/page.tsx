import Link from "next/link";

/** 트레이너 가입 직후 근무 가능 시간 첫 설정. 설정 화면은 M3에서 붙인다. */
export default function OnboardingAvailabilityPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-xl font-semibold">근무 가능 시간 설정</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        근무 가능 시간을 정해야 수강생이 예약을 신청할 수 있습니다. 설정 &gt;
        근무 가능 시간에서 언제든 바꿀 수 있습니다.
      </p>
      <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        근무 가능 시간 설정은 준비 중입니다.
      </p>
      <Link
        href="/t"
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-center text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        나중에 하기
      </Link>
    </main>
  );
}
