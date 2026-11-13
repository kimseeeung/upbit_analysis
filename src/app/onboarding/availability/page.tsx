import Link from "next/link";
import { AvailabilitySetup } from "./AvailabilitySetup";

/** 트레이너 가입 직후 근무 가능 시간 첫 설정 (1.4, 4.3) */
export default function OnboardingAvailabilityPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-xl font-semibold">근무 가능 시간 설정</h1>
      <AvailabilitySetup />
      <Link
        href="/t"
        className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm dark:border-zinc-700"
      >
        나중에 하기
      </Link>
    </main>
  );
}
