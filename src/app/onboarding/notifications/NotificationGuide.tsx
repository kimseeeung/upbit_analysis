"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PushSetup } from "@/components/PushSetup";
import { Button, Card } from "@/components/ui";

type Platform = "android" | "iphone";

export function NotificationGuide() {
  const router = useRouter();
  const params = useSearchParams();
  const [platform, setPlatform] = useState<Platform>("android");
  useEffect(() => {
    // 기기 종류는 브라우저에서만 알 수 있다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/iPhone|iPad/.test(navigator.userAgent)) setPlatform("iphone");
  }, []);

  const nextHref =
    params.get("then") === "availability" ? "/onboarding/availability" : "/";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        예약 확정 요청, 수업 안내, 완료 승인 요청을 받으려면 홈 화면에 추가하고
        알림을 허용해 주세요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["android", "iphone"] as const).map((p) => (
          <Button
            key={p}
            variant={platform === p ? "primary" : "secondary"}
            onClick={() => setPlatform(p)}
            aria-pressed={platform === p}
          >
            {p === "android" ? "Android" : "iPhone"}
          </Button>
        ))}
      </div>
      {platform === "android" ? (
        <Card title="Android (크롬)">
          <ol className="list-decimal pl-5 text-sm leading-6">
            <li>크롬 오른쪽 위 ⋮ 메뉴를 누릅니다</li>
            <li>
              &quot;홈 화면에 추가&quot; 또는 &quot;앱 설치&quot;를 누릅니다
            </li>
            <li>홈 화면의 PT 관리 아이콘으로 엽니다</li>
            <li>
              아래 &quot;알림 허용&quot;을 누르고 &quot;허용&quot;을 고릅니다
            </li>
          </ol>
        </Card>
      ) : (
        <Card title="iPhone (Safari, iOS 16.4 이상)">
          <ol className="list-decimal pl-5 text-sm leading-6">
            <li>Safari 아래쪽 공유 버튼(□↑)을 누릅니다</li>
            <li>&quot;홈 화면에 추가&quot;를 누릅니다</li>
            <li>
              홈 화면의 PT 관리 아이콘으로 엽니다 (Safari에서는 알림을 받을 수
              없습니다)
            </li>
            <li>
              아래 &quot;알림 허용&quot;을 누르고 &quot;허용&quot;을 고릅니다
            </li>
          </ol>
          <p className="text-xs text-zinc-500">
            iPhone은 오래 접속하지 않으면 저장된 데이터가 지워질 수 있어 홈 화면
            추가를 권장합니다.
          </p>
        </Card>
      )}
      <PushSetup />
      <Button onClick={() => router.replace(nextHref)}>다음</Button>
    </div>
  );
}
