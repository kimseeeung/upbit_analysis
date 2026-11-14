"use client";

import { AtSign, CalendarHeart, Phone } from "lucide-react";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { validatePassword, validatePin } from "@/lib/auth/policy";
import { api } from "./api";
import { PhoneVerification } from "./PhoneVerification";
import { LastBackup } from "./OfflineManager";
import { PushSetup } from "./PushSetup";
import { clearOffline } from "@/lib/offline/store";
import { WithdrawCard } from "./WithdrawCard";
import {
  Button,
  Card,
  Checkbox,
  CollapsibleCards,
  Loading,
  MenuLink,
  Notice,
  PasswordField,
  ROLE_LABEL,
  TextField,
} from "./ui";

interface Profile {
  loginId: string;
  role: keyof typeof ROLE_LABEL;
  name: string;
  phoneMasked: string;
  joinedAt: string;
  workplaceText: string | null;
  workplaceAddress: string | null;
  pinLocked: boolean;
  marketing: { agreed: boolean } | null;
}

interface DeviceSession {
  id: string;
  deviceLabel: string;
  lastSeenAt: string;
  persistent: boolean;
  current: boolean;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 맨 위 프로필 (항상 보임) */
function ProfileHero({ profile }: { profile: Profile }) {
  return (
    <section
      aria-label="내 프로필"
      className="bg-surface flex flex-col gap-4 rounded-2xl p-5"
    >
      {/* 프로필 카드 */}
      <div className="from-brand-500 shadow-brand-500/25 flex items-center gap-3 rounded-2xl bg-gradient-to-br to-pink-400 p-4 text-white shadow-md">
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-white/25 text-2xl font-black ring-2 ring-white/60">
          {profile.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{profile.name}님</p>
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">
            {ROLE_LABEL[profile.role]}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted inline-flex items-center gap-1.5">
          <AtSign className="size-4" aria-hidden />
          아이디
        </dt>
        <dd className="font-semibold">{profile.loginId}</dd>
        <dt className="text-muted inline-flex items-center gap-1.5">
          <Phone className="size-4" aria-hidden />
          전화번호
        </dt>
        <dd className="font-semibold">{profile.phoneMasked}</dd>
        <dt className="text-muted inline-flex items-center gap-1.5">
          <CalendarHeart className="size-4" aria-hidden />
          가입일
        </dt>
        <dd className="font-semibold">{profile.joinedAt}</dd>
      </dl>
    </section>
  );
}

/** 이름·근무지 수정 (접히는 메뉴 줄) */
function ProfileEditCard({
  profile,
  reload,
}: {
  profile: Profile;
  reload: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [workplace, setWorkplace] = useState(profile.workplaceText ?? "");
  const [address, setAddress] = useState(profile.workplaceAddress ?? "");
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function save() {
    const r = await api("/api/me/profile", {
      method: "PATCH",
      body: {
        name,
        ...(profile.role === "TRAINER"
          ? { workplaceText: workplace, workplaceAddress: address }
          : {}),
      },
    });
    setMsg(
      r.ok
        ? { tone: "success", text: "저장했습니다" }
        : { tone: "error", text: r.message },
    );
    if (r.ok) reload();
  }

  return (
    <Card title="기본 정보 수정" icon="user">
      <TextField
        label="이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {profile.role === "TRAINER" && (
        <>
          <TextField
            label="근무지"
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value)}
            hint="센터 소속·이동은 센터 기능에서 합니다"
          />
          <TextField
            label="근무지 주소"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button variant="secondary" onClick={save}>
        저장
      </Button>
    </Card>
  );
}

function PhoneCard({ reload }: { reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  return (
    <Card title="전화번호 변경">
      {open ? (
        <PhoneVerification
          purpose="CHANGE_PHONE"
          onVerified={async (v) => {
            const r = await api("/api/me/phone", { body: v });
            setMsg(
              r.ok
                ? { tone: "success", text: "전화번호를 바꿨습니다" }
                : { tone: "error", text: r.message },
            );
            if (r.ok) {
              setOpen(false);
              reload();
            }
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          새 번호로 본인인증
        </Button>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </Card>
  );
}

function PasswordCard({ loginId }: { loginId: string }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const policy = pw ? validatePassword(pw, loginId) : null;
  async function submit() {
    const r = await api("/api/me/password", {
      body: {
        currentPassword: current,
        newPassword: pw,
        newPasswordConfirm: pw2,
      },
    });
    if (r.ok) {
      setCurrent("");
      setPw("");
      setPw2("");
      setMsg({
        tone: "success",
        text: "비밀번호를 바꿨습니다. 다른 기기는 모두 로그아웃했습니다",
      });
    } else setMsg({ tone: "error", text: r.message });
  }
  return (
    <Card title="비밀번호 변경">
      <PasswordField
        label="현재 비밀번호"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <PasswordField
        label="새 비밀번호"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        error={policy && !policy.ok ? policy.message : null}
      />
      <PasswordField
        label="새 비밀번호 확인"
        autoComplete="new-password"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        error={pw2 && pw !== pw2 ? "비밀번호 확인이 일치하지 않습니다" : null}
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button
        variant="secondary"
        disabled={!current || !policy?.ok || pw !== pw2}
        onClick={submit}
      >
        비밀번호 바꾸기
      </Button>
    </Card>
  );
}

function PinCard({ locked }: { locked: boolean }) {
  const [verification, setVerification] = useState<{
    verificationId: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const policy = pin.length === 4 ? validatePin(pin) : null;
  async function submit() {
    if (!verification) return;
    const r = await api("/api/me/pin", {
      body: { ...verification, pin, pinConfirm: pin2 },
    });
    if (r.ok) {
      setMsg({ tone: "success", text: "PIN을 바꿨습니다" });
      setOpen(false);
      setVerification(null);
      setPin("");
      setPin2("");
    } else setMsg({ tone: "error", text: r.message });
  }
  return (
    <Card title="수업 완료 승인 PIN">
      {locked && (
        <Notice tone="warning">
          PIN을 5회 잘못 입력해 잠겼습니다. 본인인증 후 새 PIN을 정해 주세요.
        </Notice>
      )}
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          PIN 변경 (본인인증)
        </Button>
      ) : !verification ? (
        <PhoneVerification purpose="RESET_PIN" onVerified={setVerification} />
      ) : (
        <>
          <PasswordField
            label="새 PIN (숫자 4자리)"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            error={policy && !policy.ok ? policy.message : null}
          />
          <PasswordField
            label="새 PIN 확인"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
          />
          <Button
            variant="secondary"
            disabled={!policy?.ok || pin !== pin2}
            onClick={submit}
          >
            PIN 저장
          </Button>
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </Card>
  );
}

function DevicesCard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ sessions: DeviceSession[] }>("/api/me/sessions");
    if (r.ok) setSessions(r.data.sessions);
  }, []);
  useEffect(() => {
    // 처음 열 때 기기 목록을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function logout(id: string) {
    const r = await api<{ loggedOut: boolean }>(`/api/me/sessions/${id}`, {
      method: "DELETE",
    });
    if (r.ok && r.data.loggedOut) {
      router.replace("/login");
      router.refresh();
    } else void load();
  }
  async function logoutAll() {
    const r = await api("/api/me/sessions/logout-all", { body: {} });
    if (r.ok) {
      await clearOffline();
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Card title="로그인된 기기">
      <ul className="divide-line flex flex-col divide-y text-sm">
        {sessions?.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2">
            <span>
              {s.deviceLabel}
              {s.current && (
                <span className="ml-1 text-xs text-blue-600">이 기기</span>
              )}
              <span className="text-muted block text-xs">
                마지막 접속 {fmt(s.lastSeenAt)}{" "}
                {s.persistent ? "· 자동 로그인" : ""}
              </span>
            </span>
            <Button variant="ghost" onClick={() => logout(s.id)}>
              로그아웃
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={logoutAll}>
        모든 기기에서 로그아웃
      </Button>
    </Card>
  );
}

function MarketingCard({ agreed }: { agreed: boolean }) {
  const [value, setValue] = useState(agreed);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="수신 동의">
      <Checkbox
        label="마케팅 정보 수신 (선택)"
        checked={value}
        onChange={async (v) => {
          setValue(v);
          const r = await api("/api/me/terms", {
            method: "PATCH",
            body: { marketing: v },
          });
          if (!r.ok) {
            setValue(!v);
            setError(r.message);
          }
        }}
      />
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

/** children: 메뉴 맨 위에 넣을 항목 (예: 담당 트레이너 변경) */
export function AccountPanel({ children }: { children?: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<Profile>("/api/me/profile");
    if (r.ok) setProfile(r.data);
    else setError(r.message);
  }, []);
  useEffect(() => {
    // 처음 열 때 내 정보를 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!profile)
    return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  return (
    <div className="flex flex-col gap-3">
      <ProfileHero profile={profile} />
      <CollapsibleCards>
        <ProfileEditCard profile={profile} reload={load} />
        {children}
        <PhoneCard reload={load} />
        <PasswordCard loginId={profile.loginId} />
        {profile.role === "STUDENT" && <PinCard locked={profile.pinLocked} />}
        {profile.marketing && (
          <MarketingCard agreed={profile.marketing.agreed} />
        )}
        <Card title="알림 설정">
          <PushSetup />
        </Card>
        <Card title="휴대폰 백업">
          <LastBackup />
        </Card>
        <DevicesCard />
      </CollapsibleCards>
      <nav
        aria-label="고객 지원"
        className="bg-surface divide-line flex flex-col divide-y overflow-hidden rounded-2xl"
      >
        <MenuLink href="/me/notices" icon="megaphone">
          공지사항
        </MenuLink>
        <MenuLink href="/me/inquiries" icon="question">
          문의하기
        </MenuLink>
      </nav>
      <CollapsibleCards>
        <WithdrawCard />
      </CollapsibleCards>
    </div>
  );
}
