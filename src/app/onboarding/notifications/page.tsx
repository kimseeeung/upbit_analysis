import { Suspense } from "react";
import { NotificationGuide } from "./NotificationGuide";

export default function OnboardingNotificationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-xl font-semibold">알림 허용 · 홈 화면 추가</h1>
      <Suspense>
        <NotificationGuide />
      </Suspense>
    </main>
  );
}
