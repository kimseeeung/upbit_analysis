"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Card, Checkbox, Notice, TextField } from "@/components/ui";

interface Data {
  memberships: {
    id: string;
    status: "ACTIVE" | "PENDING";
    waitingConsent: boolean;
    center: {
      id: string;
      name: string;
      address: string;
      status: string;
      dissolveAt: string | null;
    };
  }[];
  isCenterAdmin: boolean;
  departure: { type: string; deadlineAt: string } | null;
}

const CONSENT_TEXT =
  "일정·수강생·이용권·결제 기록을 센터가 볼 수 있음에 동의합니다";

/** 트레이너 내 정보: 센터 소속·이동, 센터 만들기, 관리자 초대 수락 (9.1, 9.2, 7.3) */
export function CenterSection() {
  const [d, setD] = useState<Data | null>(null);
  const [mode, setMode] = useState<
    "none" | "code" | "search" | "create" | "admin"
  >("none");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    { id: string; name: string; address: string }[]
  >([]);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    bizNo: "",
  });
  const [msg, setMsg] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/t/center");
    if (r.ok) setD(r.data);
  }, []);
  useEffect(() => {
    // 처음 열 때 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function post(url: string, body: unknown, ok: string) {
    const r = await api(url, { body });
    setMsg(
      r.ok ? { tone: "success", text: ok } : { tone: "error", text: r.message },
    );
    if (r.ok) {
      setMode("none");
      void load();
    }
    return r.ok;
  }

  if (!d) return null;
  const active = d.memberships.find((m) => m.status === "ACTIVE");
  const pending = d.memberships.find((m) => m.status === "PENDING");
  return (
    <Card title="센터 소속">
      {active ? (
        <>
          <p className="text-sm">
            {active.center.name}{" "}
            <span className="text-muted">· {active.center.address}</span>
          </p>
          {active.center.status === "DISSOLVING" &&
            active.center.dissolveAt && (
              <Notice tone="warning">
                {fmtDateTime(active.center.dissolveAt)}에 센터가 해산되어 개인
                트레이너로 바뀝니다.
              </Notice>
            )}
          {d.departure ? (
            <Notice>
              센터 이동 진행 중 · {fmtDateTime(d.departure.deadlineAt)}에 적용
              (수강생 선택 기한)
            </Notice>
          ) : (
            <Button
              variant="ghost"
              onClick={() =>
                post(
                  "/api/t/center/move",
                  {},
                  "센터 이동을 신청했습니다. 수강생 선택 기한(7일) 뒤 소속이 해제됩니다",
                )
              }
            >
              센터 이동 신청 (소속 해제)
            </Button>
          )}
        </>
      ) : pending ? (
        pending.waitingConsent ? (
          <>
            <p className="text-sm">
              {pending.center.name}에서 소속을 승인했습니다.
            </p>
            <Checkbox
              label={CONSENT_TEXT}
              checked={consent}
              onChange={setConsent}
            />
            <Button
              disabled={!consent}
              onClick={() =>
                post(
                  "/api/t/center/consent",
                  { membershipId: pending.id },
                  "센터 소속이 완료되었습니다",
                )
              }
            >
              동의하고 소속하기
            </Button>
          </>
        ) : (
          <p className="text-sm">
            {pending.center.name}에 소속 요청 중입니다 (센터 승인 대기).
          </p>
        )
      ) : (
        <p className="text-muted text-sm">개인 트레이너입니다.</p>
      )}

      {!active && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setMode("code")}>
            초대 코드 입력
          </Button>
          <Button variant="secondary" onClick={() => setMode("search")}>
            센터 검색
          </Button>
          {!d.isCenterAdmin && (
            <Button variant="secondary" onClick={() => setMode("create")}>
              센터 만들기
            </Button>
          )}
        </div>
      )}
      {!d.isCenterAdmin && (
        <Button variant="ghost" onClick={() => setMode("admin")}>
          센터 관리자 초대 코드가 있어요
        </Button>
      )}

      {mode === "code" && (
        <>
          <TextField
            label="초대 코드"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Checkbox
            label={CONSENT_TEXT}
            checked={consent}
            onChange={setConsent}
          />
          <Button
            disabled={!code || !consent}
            onClick={() =>
              post(
                "/api/t/center/join",
                { code, consent },
                "센터에 소속되었습니다",
              )
            }
          >
            소속하기
          </Button>
        </>
      )}
      {mode === "search" && (
        <>
          <div className="flex items-end gap-2">
            <TextField
              className="flex-1"
              label="센터 이름"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                const r = await api<{
                  centers: { id: string; name: string; address: string }[];
                }>(`/api/public/centers?q=${encodeURIComponent(q)}`);
                if (r.ok) setHits(r.data.centers);
              }}
            >
              검색
            </Button>
          </div>
          {hits.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {c.name} <span className="text-muted">{c.address}</span>
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  post(
                    "/api/t/center/request",
                    { centerId: c.id },
                    "소속을 요청했습니다",
                  )
                }
              >
                소속 요청
              </Button>
            </div>
          ))}
        </>
      )}
      {mode === "create" && (
        <>
          <TextField
            label="센터명"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="주소"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <TextField
            label="대표 전화"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <TextField
            label="사업자등록번호 (선택)"
            value={form.bizNo}
            onChange={(e) => setForm({ ...form, bizNo: e.target.value })}
          />
          <Button
            onClick={() =>
              post(
                "/api/t/center/create",
                form,
                "센터를 만들었습니다. 상단에서 센터 화면으로 바꿀 수 있습니다",
              )
            }
          >
            센터 만들기
          </Button>
        </>
      )}
      {mode === "admin" && (
        <>
          <TextField
            label="관리자 초대 코드"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button
            disabled={!code}
            onClick={() =>
              post(
                "/api/center/admin-invite",
                { code },
                "센터 관리자 권한이 추가되었습니다",
              )
            }
          >
            관리자 되기
          </Button>
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </Card>
  );
}
