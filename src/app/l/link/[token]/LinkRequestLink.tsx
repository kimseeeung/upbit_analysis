"use client";

import { Button } from "@/components/ui";
import { LinkShell, useLinkData } from "../../LinkShell";

/** 트레이너 연결 요청 링크 (3.1) */
export function LinkRequestLink({ token }: { token: string }) {
  const { data, error, done, act } = useLinkData<{
    status: string;
    trainerName: string;
    workplace: string | null;
  }>(`/api/l/link/${token}`);
  return (
    <LinkShell title="트레이너 연결 요청" error={error} done={done}>
      {data && (
        <>
          <p className="text-sm">
            {data.trainerName} 트레이너
            {data.workplace ? ` · ${data.workplace}` : ""}가 연결을
            요청했습니다.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => act({ accept: true }, "연결을 수락했습니다")}
            >
              수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => act({ accept: false }, "연결을 거절했습니다")}
            >
              거절
            </Button>
          </div>
        </>
      )}
    </LinkShell>
  );
}
