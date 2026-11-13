"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { PhoneVerification } from "@/components/PhoneVerification";
import {
  Button,
  Card,
  Checkbox,
  Notice,
  PasswordField,
  ROLE_LABEL,
  RoleTabs,
  TextField,
  type RoleKey,
} from "@/components/ui";
import {
  validateLoginId,
  validatePassword,
  validatePin,
} from "@/lib/auth/policy";

type Step = "role" | "info" | "verify" | "pin" | "terms";

interface Terms {
  kind: "SERVICE" | "PRIVACY" | "THIRD_PARTY" | "NOTIFY" | "MARKETING";
  title: string;
  required: boolean;
  body: string;
}

interface TrainerHit {
  id: string;
  name: string;
  workplace: string;
}
interface CenterHit {
  id: string;
  name: string;
  address: string;
  verified: boolean;
}

const STEP_TITLE: Record<Step, string> = {
  role: "회원 유형",
  info: "정보 입력",
  verify: "휴대폰 본인인증",
  pin: "수업 완료 승인 PIN",
  terms: "약관 동의",
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<RoleKey | null>(null);

  // 정보
  const [loginId, setLoginId] = useState("");
  const [idCheck, setIdCheck] = useState<{
    id: string;
    available: boolean;
    message: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"" | "MALE" | "FEMALE">("");
  const [birthDate, setBirthDate] = useState("");

  // 트레이너: 근무지
  const [centerQuery, setCenterQuery] = useState("");
  const [centerHits, setCenterHits] = useState<CenterHit[]>([]);
  const [center, setCenter] = useState<CenterHit | null>(null);
  const [manualWorkplace, setManualWorkplace] = useState(false);
  const [workplaceName, setWorkplaceName] = useState("");
  const [workplaceAddress, setWorkplaceAddress] = useState("");

  // 수강생: 담당 트레이너
  const [trainerQuery, setTrainerQuery] = useState("");
  const [trainerHits, setTrainerHits] = useState<TrainerHit[]>([]);
  const [trainer, setTrainer] = useState<TrainerHit | null>(null);
  const [unregisteredTrainer, setUnregisteredTrainer] = useState(false);

  // 센터 관리자: 센터 정보
  const [centerName, setCenterName] = useState("");
  const [centerAddress, setCenterAddress] = useState("");
  const [centerPhone, setCenterPhone] = useState("");
  const [bizNo, setBizNo] = useState("");

  // 인증·PIN·약관
  const [verification, setVerification] = useState<{
    verificationId: string;
    phone: string;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [terms, setTerms] = useState<Terms[]>([]);
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dCenter = useDebounced(centerQuery);
  const dTrainer = useDebounced(trainerQuery);

  useEffect(() => {
    if (role !== "TRAINER" || !dCenter.trim()) return;
    let alive = true;
    api<{ centers: CenterHit[] }>(
      `/api/public/centers?q=${encodeURIComponent(dCenter)}`,
    ).then((r) => {
      if (alive && r.ok) setCenterHits(r.data.centers);
    });
    return () => {
      alive = false;
    };
  }, [dCenter, role]);

  useEffect(() => {
    if (role !== "STUDENT" || !dTrainer.trim()) return;
    let alive = true;
    api<{ trainers: TrainerHit[] }>(
      `/api/public/trainers?q=${encodeURIComponent(dTrainer)}`,
    ).then((r) => {
      if (alive && r.ok) setTrainerHits(r.data.trainers);
    });
    return () => {
      alive = false;
    };
  }, [dTrainer, role]);

  useEffect(() => {
    if (step !== "terms" || terms.length > 0) return;
    api<{ terms: Terms[] }>("/api/auth/terms").then((r) => {
      if (r.ok) setTerms(r.data.terms);
      else setError(r.message);
    });
  }, [step, terms.length]);

  const steps: Step[] = useMemo(
    () =>
      role === "STUDENT"
        ? ["role", "info", "verify", "pin", "terms"]
        : ["role", "info", "verify", "terms"],
    [role],
  );
  const stepIndex = steps.indexOf(step);

  const loginIdPolicy = loginId ? validateLoginId(loginId) : null;
  const passwordPolicy = password ? validatePassword(password, loginId) : null;
  const pinPolicy =
    pin.length === 4 ? validatePin(pin, birthDate || null) : null;

  async function checkLoginId() {
    const r = await api<{ available: boolean; message: string }>(
      `/api/auth/check-login-id?loginId=${encodeURIComponent(loginId)}`,
    );
    if (r.ok) setIdCheck({ id: loginId, ...r.data });
  }

  function infoError(): string | null {
    if (!loginIdPolicy?.ok)
      return loginIdPolicy && !loginIdPolicy.ok
        ? loginIdPolicy.message
        : "아이디를 입력해 주세요";
    if (!idCheck || idCheck.id !== loginId)
      return "아이디 중복 확인을 해 주세요";
    if (!idCheck.available) return idCheck.message;
    if (!passwordPolicy?.ok)
      return passwordPolicy && !passwordPolicy.ok
        ? passwordPolicy.message
        : "비밀번호를 입력해 주세요";
    if (password !== passwordConfirm)
      return "비밀번호 확인이 일치하지 않습니다";
    if (!name.trim()) return "이름을 입력해 주세요";
    if (
      role === "TRAINER" &&
      !center &&
      !(manualWorkplace && workplaceName.trim())
    ) {
      return "근무지를 선택하거나 직접 입력해 주세요";
    }
    if (
      role === "STUDENT" &&
      !trainer &&
      !(unregisteredTrainer && trainerQuery.trim())
    ) {
      return "담당 트레이너를 선택하거나 이름을 입력해 주세요";
    }
    if (
      role === "CENTER_ADMIN" &&
      (!centerName.trim() || !centerAddress.trim() || !centerPhone.trim())
    ) {
      return "센터명, 주소, 대표 전화를 입력해 주세요";
    }
    return null;
  }

  function next() {
    setError(null);
    if (step === "role" && !role) return setError("회원 유형을 선택해 주세요");
    if (step === "info") {
      const e = infoError();
      if (e) return setError(e);
    }
    if (step === "verify" && !verification)
      return setError("휴대폰 본인인증을 해 주세요");
    if (step === "pin") {
      if (!pinPolicy) return setError("PIN은 숫자 4자리여야 합니다");
      if (!pinPolicy.ok) return setError(pinPolicy.message);
      if (pin !== pinConfirm) return setError("PIN 확인이 일치하지 않습니다");
    }
    setStep(steps[stepIndex + 1]);
  }

  function back() {
    setError(null);
    if (stepIndex > 0) setStep(steps[stepIndex - 1]);
  }

  const allRequiredAgreed =
    terms.length > 0 && terms.every((t) => !t.required || consents[t.kind]);
  const allAgreed = terms.length > 0 && terms.every((t) => consents[t.kind]);

  async function submit() {
    if (!role || !verification) return;
    setBusy(true);
    setError(null);
    const r = await api<{ next: string }>("/api/auth/signup", {
      body: {
        role,
        loginId,
        password,
        passwordConfirm,
        name: name.trim(),
        phone: verification.phone,
        verificationId: verification.verificationId,
        gender: gender || null,
        birthDate: birthDate || null,
        ...(role === "STUDENT"
          ? {
              pin,
              pinConfirm,
              trainer: trainer
                ? { trainerUserId: trainer.id }
                : { name: trainerQuery.trim() },
            }
          : {}),
        ...(role === "TRAINER"
          ? {
              workplace: center
                ? { centerId: center.id }
                : {
                    name: workplaceName.trim(),
                    address: workplaceAddress.trim(),
                  },
            }
          : {}),
        ...(role === "CENTER_ADMIN"
          ? {
              center: {
                name: centerName,
                address: centerAddress,
                phone: centerPhone,
                bizNo: bizNo || null,
              },
            }
          : {}),
        consents,
      },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.replace(r.data.next);
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex gap-1" aria-label="가입 단계">
        {steps.map((s, i) => (
          <li
            key={s}
            className={`h-1 flex-1 rounded ${i <= stepIndex ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-800"}`}
          />
        ))}
      </ol>
      <h2 className="text-lg font-semibold">
        {stepIndex + 1}. {STEP_TITLE[step]}
      </h2>

      {step === "role" && (
        <div className="flex flex-col gap-3">
          <RoleTabs value={role} onChange={setRole} />
          <p className="text-xs text-zinc-500">
            회원 유형은 가입 후 바꿀 수 없습니다.
          </p>
        </div>
      )}

      {step === "info" && role && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500">
            {ROLE_LABEL[role]}로 가입합니다.
          </p>
          <div className="flex items-end gap-2">
            <TextField
              className="flex-1"
              label="아이디"
              autoCapitalize="none"
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value.toLowerCase())}
              hint="영문 소문자·숫자 4~20자"
              error={
                loginIdPolicy && !loginIdPolicy.ok
                  ? loginIdPolicy.message
                  : idCheck?.id === loginId && !idCheck.available
                    ? idCheck.message
                    : null
              }
            />
            <Button
              variant="secondary"
              disabled={!loginIdPolicy?.ok}
              onClick={checkLoginId}
            >
              중복 확인
            </Button>
          </div>
          {idCheck?.id === loginId && idCheck.available && (
            <Notice tone="success">{idCheck.message}</Notice>
          )}
          <PasswordField
            label="비밀번호"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="8~20자, 영문·숫자·특수문자 모두 포함, 아이디 포함 금지"
            error={
              passwordPolicy && !passwordPolicy.ok
                ? passwordPolicy.message
                : null
            }
          />
          <PasswordField
            label="비밀번호 확인"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            error={
              passwordConfirm && password !== passwordConfirm
                ? "비밀번호 확인이 일치하지 않습니다"
                : null
            }
          />
          <TextField
            label="이름"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {role !== "CENTER_ADMIN" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="gender" className="text-sm font-medium">
                  성별 (선택)
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as typeof gender)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">선택 안 함</option>
                  <option value="MALE">남</option>
                  <option value="FEMALE">여</option>
                </select>
              </div>
              <TextField
                label="생년월일 (선택)"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          )}

          {role === "TRAINER" && (
            <Card title="근무지">
              {center ? (
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {center.name}{" "}
                    <span className="text-zinc-500">· {center.address}</span>
                  </span>
                  <Button variant="ghost" onClick={() => setCenter(null)}>
                    바꾸기
                  </Button>
                </div>
              ) : manualWorkplace ? (
                <>
                  <TextField
                    label="센터명"
                    value={workplaceName}
                    onChange={(e) => setWorkplaceName(e.target.value)}
                  />
                  <TextField
                    label="주소"
                    value={workplaceAddress}
                    onChange={(e) => setWorkplaceAddress(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => setManualWorkplace(false)}
                  >
                    센터 검색으로 돌아가기
                  </Button>
                </>
              ) : (
                <>
                  <TextField
                    label="센터 검색"
                    placeholder="센터 이름"
                    value={centerQuery}
                    onChange={(e) => setCenterQuery(e.target.value)}
                    hint="가입한 센터를 고르면 소속 요청을 보냅니다"
                  />
                  <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                    {centerQuery.trim() &&
                      centerHits.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full py-2 text-left text-sm"
                            onClick={() => setCenter(c)}
                          >
                            {c.name}{" "}
                            {c.verified && (
                              <span className="text-xs text-blue-600">
                                인증 센터
                              </span>
                            )}
                            <span className="block text-xs text-zinc-500">
                              {c.address}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                  <Button
                    variant="ghost"
                    onClick={() => setManualWorkplace(true)}
                  >
                    찾는 센터가 없어요 (직접 입력)
                  </Button>
                </>
              )}
            </Card>
          )}

          {role === "STUDENT" && (
            <Card title="담당 트레이너">
              {trainer ? (
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {trainer.name}{" "}
                    <span className="text-zinc-500">· {trainer.workplace}</span>
                  </span>
                  <Button variant="ghost" onClick={() => setTrainer(null)}>
                    바꾸기
                  </Button>
                </div>
              ) : (
                <>
                  <TextField
                    label="트레이너 이름"
                    value={trainerQuery}
                    onChange={(e) => {
                      setTrainerQuery(e.target.value);
                      setUnregisteredTrainer(false);
                    }}
                    hint="고르면 트레이너에게 연결 요청을 보냅니다"
                  />
                  {!unregisteredTrainer && (
                    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                      {trainerQuery.trim() &&
                        trainerHits.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              className="w-full py-2 text-left text-sm"
                              onClick={() => setTrainer(t)}
                            >
                              {t.name}
                              <span className="block text-xs text-zinc-500">
                                {t.workplace}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                  {trainerQuery.trim() && (
                    <Checkbox
                      label="트레이너가 아직 가입하지 않았어요 (이름만 저장)"
                      checked={unregisteredTrainer}
                      onChange={setUnregisteredTrainer}
                    />
                  )}
                </>
              )}
            </Card>
          )}

          {role === "CENTER_ADMIN" && (
            <Card title="센터 정보">
              <TextField
                label="센터명"
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
              />
              <TextField
                label="주소"
                value={centerAddress}
                onChange={(e) => setCenterAddress(e.target.value)}
              />
              <TextField
                label="대표 전화"
                inputMode="tel"
                value={centerPhone}
                onChange={(e) => setCenterPhone(e.target.value)}
              />
              <TextField
                label="사업자등록번호 (선택)"
                inputMode="numeric"
                value={bizNo}
                onChange={(e) => setBizNo(e.target.value)}
                hint="입력하면 '인증 센터'로 표시됩니다"
              />
            </Card>
          )}
        </div>
      )}

      {step === "verify" && (
        <PhoneVerification
          purpose="SIGNUP"
          initialPhone={verification?.phone ?? ""}
          onVerified={(v) => setVerification(v)}
        />
      )}

      {step === "pin" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500">
            수업이 끝나면 이 PIN으로 수업 완료를 승인합니다. 로그인 비밀번호와
            다르게 정해 주세요.
          </p>
          <PasswordField
            label="PIN (숫자 4자리)"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            hint="1111 같은 반복, 1234·4321 같은 연속, 생년월일 뒤 4자리는 쓸 수 없습니다"
            error={pinPolicy && !pinPolicy.ok ? pinPolicy.message : null}
          />
          <PasswordField
            label="PIN 확인"
            inputMode="numeric"
            maxLength={4}
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
            error={
              pinConfirm.length === 4 && pin !== pinConfirm
                ? "PIN 확인이 일치하지 않습니다"
                : null
            }
          />
        </div>
      )}

      {step === "terms" && (
        <div className="flex flex-col gap-3">
          <Checkbox
            label={<strong>전체 동의</strong>}
            checked={allAgreed}
            onChange={(v) =>
              setConsents(Object.fromEntries(terms.map((t) => [t.kind, v])))
            }
          />
          <hr className="border-zinc-200 dark:border-zinc-800" />
          {terms.map((t) => (
            <div key={t.kind} className="flex flex-col gap-1">
              <Checkbox
                label={`${t.title} (${t.required ? "필수" : "선택"})`}
                checked={!!consents[t.kind]}
                onChange={(v) => setConsents((c) => ({ ...c, [t.kind]: v }))}
              >
                <button
                  type="button"
                  className="text-xs text-zinc-500 underline"
                  onClick={() =>
                    setOpenTerm(openTerm === t.kind ? null : t.kind)
                  }
                >
                  보기
                </button>
              </Checkbox>
              {openTerm === t.kind && (
                <p className="rounded-lg bg-zinc-100 p-3 text-xs whitespace-pre-line text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {t.body}
                </p>
              )}
            </div>
          ))}
          <div className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <p className="font-medium">개인정보 처리 위탁 (고지)</p>
            <p>SMS 인증번호 발송 대행사, 서버 운영사에 처리를 맡깁니다.</p>
            <p className="mt-2 font-medium">웹 푸시 알림 허용 (안내)</p>
            <p>
              가입 후 브라우저의 알림 허용을 따로 눌러야 합니다. 허용하지 않으면
              자동 알림을 받을 수 없습니다.
            </p>
          </div>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex gap-2">
        {stepIndex > 0 && (
          <Button variant="secondary" onClick={back} className="flex-1">
            이전
          </Button>
        )}
        {step === "terms" ? (
          <Button
            className="flex-1"
            disabled={busy || !allRequiredAgreed}
            onClick={submit}
          >
            가입하기
          </Button>
        ) : (
          <Button
            className="flex-1"
            onClick={next}
            disabled={step === "verify" && !verification}
          >
            다음
          </Button>
        )}
      </div>
    </div>
  );
}
