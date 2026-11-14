import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-10">
      <Logo />
      <div>
        <h1 className="text-2xl font-extrabold">로그인</h1>
        <p className="text-muted mt-1 text-sm">
          다시 만나서 반가워요 👋 오늘 수업을 확인해 보세요
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
