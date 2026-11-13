import { kstDateTime } from "@/lib/time";
import { signup, type SignupInput } from "@/server/auth/signup-service";
import { sendVerificationCode, verifyCode } from "@/server/auth/sms-service";
import { ALL_CONSENTS, captureSms, testDb } from "./db-helpers";

export const T0 = kstDateTime(2026, 11, 13, 10, 0);

let seq = 0;
export function resetFactorySeq() {
  seq = 0;
}

export async function verifiedPhone(
  phone: string,
  purpose: "SIGNUP" | "FIND_ID" | "RESET_PW" | "RESET_PIN" | "CHANGE_PHONE",
  now = T0,
) {
  const db = testDb();
  const sms = captureSms();
  const { verificationId } = await sendVerificationCode(
    db,
    { phone, purpose },
    now,
  );
  await verifyCode(db, { verificationId, code: sms.lastCode() }, now);
  return verificationId;
}

export async function makeUser(
  role: "TRAINER" | "STUDENT" | "CENTER_ADMIN",
  overrides: Partial<SignupInput> = {},
) {
  seq += 1;
  const phone = overrides.phone ?? `0109000${String(seq).padStart(4, "0")}`;
  const loginId =
    overrides.loginId ?? `user${seq}${role.toLowerCase().slice(0, 1)}`;
  const verificationId = await verifiedPhone(phone, "SIGNUP");
  const input: SignupInput = {
    role,
    loginId,
    password: "abcd123!",
    passwordConfirm: "abcd123!",
    name: `사용자${seq}`,
    phone,
    verificationId,
    consents: ALL_CONSENTS,
    ...(role === "STUDENT"
      ? {
          pin: "1357",
          pinConfirm: "1357",
          trainer: { name: "미가입 트레이너" },
        }
      : {}),
    ...(role === "TRAINER"
      ? { workplace: { name: "강남 PT", address: "서울" } }
      : {}),
    ...(role === "CENTER_ADMIN"
      ? { center: { name: "센터A", address: "서울", phone: "0212345678" } }
      : {}),
    ...overrides,
  };
  const r = await signup(testDb(), input, T0);
  return { ...r, loginId, phone, password: "abcd123!", name: input.name };
}
