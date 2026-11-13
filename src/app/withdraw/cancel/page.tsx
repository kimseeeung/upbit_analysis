import { Suspense } from "react";
import { requireUser } from "@/lib/auth/guard";
import { CancelWithdraw } from "./CancelWithdraw";

async function Gate() {
  await requireUser();
  return <CancelWithdraw />;
}

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-xl font-semibold">탈퇴를 취소할까요?</h1>
      <Suspense>
        <Gate />
      </Suspense>
    </main>
  );
}
