import type { Gender, UserRole } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { hashSecret } from "@/lib/auth/hash";
import {
  validateLoginId,
  validatePassword,
  validatePin,
} from "@/lib/auth/policy";
import { normalizePhone } from "@/lib/phone";
import { parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { consumeVerification } from "./sms-service";
import { recordConsents, type ConsentInput } from "./terms-service";

export interface SignupInput {
  role: UserRole;
  loginId: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  verificationId: string;
  gender?: Gender | null;
  /** "YYYY-MM-DD" */
  birthDate?: string | null;
  /** 수강생 */
  pin?: string;
  pinConfirm?: string;
  /** 수강생: 가입한 트레이너를 고르거나, 미가입 트레이너면 이름만 */
  trainer?: { trainerUserId: string } | { name: string } | null;
  /** 트레이너: 가입한 센터를 고르거나 직접 입력 */
  workplace?: { centerId: string } | { name: string; address: string } | null;
  /** 센터 관리자 */
  center?: {
    name: string;
    address: string;
    phone: string;
    bizNo?: string | null;
  } | null;
  consents: ConsentInput;
}

function req(value: string | undefined | null, message: string): string {
  const v = (value ?? "").trim();
  if (!v) throw new AppError("INVALID", message);
  return v;
}

function check(result: { ok: true } | { ok: false; message: string }) {
  if (!result.ok) throw new AppError("INVALID", result.message);
}

export function parseBirthDate(value: string | null | undefined, now: Date) {
  if (!value) return null;
  let d: Date;
  try {
    d = parseKstDateKey(value);
  } catch {
    throw new AppError("INVALID", "생년월일을 확인해 주세요");
  }
  if (d.getTime() > now.getTime() || d.getUTCFullYear() < 1900) {
    throw new AppError("INVALID", "생년월일을 확인해 주세요");
  }
  return d;
}

export async function isLoginIdAvailable(db: RootDb, loginId: string) {
  const exists = await db.user.findUnique({
    where: { loginId },
    select: { id: true },
  });
  return !exists;
}

export async function signup(
  db: RootDb,
  input: SignupInput,
  now = new Date(),
): Promise<{ userId: string; role: UserRole }> {
  // ── 입력 검사 (DB 전에) ──
  const loginId = input.loginId.trim();
  check(validateLoginId(loginId));
  check(validatePassword(input.password, loginId));
  if (input.password !== input.passwordConfirm) {
    throw new AppError("INVALID", "비밀번호 확인이 일치하지 않습니다");
  }
  const name = req(input.name, "이름을 입력해 주세요");
  if (name.length > 30)
    throw new AppError("INVALID", "이름은 30자까지 입력할 수 있습니다");
  const phone = normalizePhone(input.phone);
  const birthDate = parseBirthDate(input.birthDate, now);
  const gender =
    input.gender === "MALE" || input.gender === "FEMALE" ? input.gender : null;

  if (input.role === "STUDENT") {
    check(
      validatePin(input.pin ?? "", birthDate ? toKstDateKey(birthDate) : null),
    );
    if (input.pin !== input.pinConfirm) {
      throw new AppError("INVALID", "PIN 확인이 일치하지 않습니다");
    }
    if (!input.trainer) {
      throw new AppError(
        "INVALID",
        "담당 트레이너를 선택하거나 이름을 입력해 주세요",
      );
    }
  }
  if (input.role === "TRAINER" && !input.workplace) {
    throw new AppError("INVALID", "근무지를 선택하거나 입력해 주세요");
  }
  if (input.role === "CENTER_ADMIN") {
    if (!input.center)
      throw new AppError("INVALID", "센터 정보를 입력해 주세요");
    req(input.center.name, "센터명을 입력해 주세요");
    req(input.center.address, "센터 주소를 입력해 주세요");
    req(input.center.phone, "센터 대표 전화를 입력해 주세요");
    if (
      input.center.bizNo &&
      !/^\d{10}$/.test(input.center.bizNo.replace(/\D/g, ""))
    ) {
      throw new AppError("INVALID", "사업자등록번호 10자리를 확인해 주세요");
    }
  }

  const password = await hashSecret(input.password);
  const pin = input.role === "STUDENT" ? await hashSecret(input.pin!) : null;

  try {
    return await db.$transaction(async (tx) => {
      await consumeVerification(
        tx,
        { verificationId: input.verificationId, purpose: "SIGNUP", phone },
        now,
      );
      if (
        await tx.user.findUnique({ where: { loginId }, select: { id: true } })
      ) {
        throw new AppError("LOGIN_ID_TAKEN", "이미 사용 중인 아이디입니다");
      }
      if (
        await tx.user.findUnique({ where: { phone }, select: { id: true } })
      ) {
        throw new AppError("PHONE_TAKEN", "이미 가입된 전화번호입니다");
      }

      const user = await tx.user.create({
        data: {
          loginId,
          passwordHash: password.hash,
          passwordSalt: password.salt,
          passwordChangedAt: now,
          role: input.role,
          name,
          phone,
          phoneVerifiedAt: now,
          gender,
          birthDate,
          createdAt: now,
        },
      });

      const extra: Record<string, unknown> = {};

      if (input.role === "STUDENT") {
        const trainer = input.trainer!;
        let requestedTrainerName: string | null = null;
        const student = await tx.student.create({
          data: { userId: user.id, name, phone },
        });
        if ("trainerUserId" in trainer) {
          const t = await tx.user.findFirst({
            where: {
              id: trainer.trainerUserId,
              role: "TRAINER",
              status: "ACTIVE",
            },
            select: { id: true },
          });
          if (!t)
            throw new AppError("INVALID", "선택한 트레이너를 찾을 수 없습니다");
          const link = await tx.linkRequest.create({
            data: {
              fromUserId: user.id,
              toUserId: t.id,
              studentId: student.id,
            },
          });
          extra.linkRequestId = link.id;
        } else {
          requestedTrainerName = req(
            trainer.name,
            "트레이너 이름을 입력해 주세요",
          );
        }
        await tx.studentProfile.create({
          data: {
            userId: user.id,
            pinHash: pin!.hash,
            pinSalt: pin!.salt,
            requestedTrainerName,
          },
        });
      }

      if (input.role === "TRAINER") {
        const w = input.workplace!;
        if ("centerId" in w) {
          const center = await tx.center.findFirst({
            where: { id: w.centerId, status: "ACTIVE" },
            select: { id: true, name: true, address: true },
          });
          if (!center)
            throw new AppError("INVALID", "선택한 센터를 찾을 수 없습니다");
          await tx.trainerProfile.create({ data: { userId: user.id } });
          const m = await tx.centerMembership.create({
            data: { centerId: center.id, trainerId: user.id },
          });
          extra.membershipRequestId = m.id;
        } else {
          await tx.trainerProfile.create({
            data: {
              userId: user.id,
              workplaceText: req(w.name, "근무지 이름을 입력해 주세요"),
              workplaceAddress: (w.address ?? "").trim() || null,
            },
          });
        }
      }

      if (input.role === "CENTER_ADMIN") {
        const c = input.center!;
        const bizNo = c.bizNo ? c.bizNo.replace(/\D/g, "") : null;
        const center = await tx.center.create({
          data: {
            name: c.name.trim(),
            address: c.address.trim(),
            phone: normalizePhone(c.phone),
            bizNo,
            verified: !!bizNo,
          },
        });
        await tx.centerAdmin.create({
          data: { centerId: center.id, userId: user.id, addedAt: now },
        });
        extra.centerId = center.id;
      }

      await recordConsents(tx, user.id, input.consents, now);

      await writeAuditLog(tx, {
        actor: { type: "USER", id: user.id },
        entity: "User",
        entityId: user.id,
        action: "user.signup",
        after: { role: user.role, loginId, name, ...extra },
        at: now,
      });

      return { userId: user.id, role: user.role };
    });
  } catch (e) {
    // 동시에 같은 아이디·번호로 가입한 경우 (unique 제약)
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      throw new AppError(
        "DUPLICATE",
        "이미 사용 중인 아이디 또는 전화번호입니다",
      );
    }
    throw e;
  }
}
