import { MergePrompt } from "./MergePrompt";

export default function MergePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-xl font-semibold">기존 기록 확인</h1>
      <MergePrompt />
    </main>
  );
}
