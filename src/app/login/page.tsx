import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">로그인</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
