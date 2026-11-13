import { Suspense } from "react";
import { requireUser } from "@/lib/auth/guard";
import { ReconsentForm } from "./ReconsentForm";

async function Gate() {
  await requireUser();
  return <ReconsentForm />;
}

export default function ReconsentPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-xl font-semibold">약관 재동의</h1>
      <Suspense>
        <Gate />
      </Suspense>
    </main>
  );
}
