import Link from "next/link";
import { Suspense } from "react";
import { SignupWizard } from "./SignupWizard";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <Link href="/" className="text-muted text-sm">
        ← 처음으로
      </Link>
      <h1 className="text-xl font-semibold">회원가입</h1>
      <Suspense>
        <SignupWizard />
      </Suspense>
    </main>
  );
}
