import Image from "next/image";
import { Suspense } from "react";
import { DisplayToggle } from "@/components/DisplayToggle";
import { LoginForm } from "./LoginForm";

/** 첫 화면 겸 로그인 화면: 앱 아이콘 · 이름 · 로그인 */
export function LoginScreen() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex justify-end">
        <DisplayToggle compact />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <Image
          src="/icons/icon.svg"
          alt="머슬매니아"
          width={88}
          height={88}
          priority
          unoptimized
          className="shadow-brand-500/30 rounded-[26px] shadow-lg"
        />
        <p className="from-brand-600 bg-gradient-to-r to-pink-500 bg-clip-text text-2xl font-black text-transparent">
          머슬매니아
        </p>
      </div>
      <div className="bg-surface flex flex-col gap-5 rounded-2xl p-5">
        <h1 className="text-xl font-extrabold">로그인</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
