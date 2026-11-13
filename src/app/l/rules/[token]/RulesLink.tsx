"use client";

import { useState } from "react";
import { RulesLines } from "@/components/RulesEditor";
import { Button, TextField } from "@/components/ui";
import { LinkShell, useLinkData } from "../../LinkShell";

interface Data {
  status: string;
  passName: string;
  trainerName: string;
  rules: { title: string; text: string }[];
}

/** 규칙 동의 링크 (3.5) */
export function RulesLink({ token }: { token: string }) {
  const { data, error, done, act } = useLinkData<Data>(`/api/l/rules/${token}`);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  return (
    <LinkShell title="수강 규칙 동의" error={error} done={done}>
      {data && (
        <>
          <p className="text-sm">
            {data.trainerName} 트레이너 · {data.passName}
          </p>
          <RulesLines lines={data.rules} />
          {asking && (
            <TextField
              label="문의 내용"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                act({ action: "AGREE" }, "수강 규칙에 동의했습니다")
              }
            >
              동의
            </Button>
            {asking ? (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() =>
                  act(
                    { action: "INQUIRE", inquiryText: text },
                    "문의를 보냈습니다",
                  )
                }
              >
                문의 보내기
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setAsking(true)}
              >
                문의하기
              </Button>
            )}
          </div>
        </>
      )}
    </LinkShell>
  );
}
