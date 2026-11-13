import { describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  buildAuditRecord,
  isSensitiveKey,
  redactSensitive,
  writeAuditLog,
} from "./audit";

describe("감사 로그", () => {
  it("비밀값 필드 이름을 알아본다", () => {
    for (const key of [
      "password",
      "passwordHash",
      "passwordSalt",
      "pin",
      "pinHash",
      "rollbackPinHash",
      "rollback_pin",
      "tokenHash",
      "codeHash",
      "code",
      "p256dh",
      "auth",
      "smsApiKey",
      "VAPID_PRIVATE_KEY_SECRET",
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
    for (const key of [
      "name",
      "opinion",
      "shipping",
      "spinner",
      "status",
      "dateKey",
      "approvalMethod",
      "author",
    ]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });

  it("중첩된 객체·배열 안의 비밀값도 가린다", () => {
    const out = redactSensitive({
      name: "홍길동",
      passwordHash: "abc",
      profile: { pinHash: "x", pinSalt: "y", gender: "F" },
      sessions: [{ tokenHash: "t", deviceLabel: "iPhone" }],
      at: new Date("2026-11-13T00:00:00Z"),
      skip: undefined,
    });
    expect(out).toEqual({
      name: "홍길동",
      passwordHash: REDACTED,
      profile: { pinHash: REDACTED, pinSalt: REDACTED, gender: "F" },
      sessions: [{ tokenHash: REDACTED, deviceLabel: "iPhone" }],
      at: "2026-11-13T00:00:00.000Z",
    });
  });

  it("레코드를 만든다", () => {
    const at = new Date("2026-11-13T01:00:00Z");
    const r = buildAuditRecord({
      actor: { type: "USER", id: "u1" },
      entity: "Booking",
      entityId: "b1",
      action: "booking.confirm",
      before: { status: "PENDING_CONFIRM" },
      after: { status: "CONFIRMED" },
      at,
    });
    expect(r).toEqual({
      actorType: "USER",
      actorId: "u1",
      entity: "Booking",
      entityId: "b1",
      action: "booking.confirm",
      before: { status: "PENDING_CONFIRM" },
      after: { status: "CONFIRMED" },
      at,
    });
  });

  it("시스템 작업은 actorId가 없다", () => {
    const r = buildAuditRecord({
      actor: { type: "SYSTEM" },
      entity: "Booking",
      entityId: "b1",
      action: "booking.autoConfirm",
    });
    expect(r.actorType).toBe("SYSTEM");
    expect(r.actorId).toBeNull();
    expect(r.before).toBeNull();
    expect(r.at).toBeInstanceOf(Date);
  });

  it("필수 값이 없으면 거부한다", () => {
    expect(() =>
      buildAuditRecord({
        actor: { type: "USER", id: "" },
        entity: "Pass",
        entityId: "p1",
        action: "pass.update",
      }),
    ).toThrow();
    expect(() =>
      buildAuditRecord({
        actor: { type: "SYSTEM" },
        entity: "Pass",
        entityId: " ",
        action: "pass.update",
      }),
    ).toThrow();
  });

  it("가린 값으로 저장한다", async () => {
    const create = vi.fn().mockResolvedValue({});
    await writeAuditLog(
      { auditLog: { create } },
      {
        actor: { type: "OPERATOR", id: "op1" },
        entity: "OperatorAccount",
        entityId: "op2",
        action: "operator.invite",
        after: { name: "관리자", rollbackPinHash: "secret" },
      },
    );
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0][0].data;
    expect(data.actorType).toBe("OPERATOR");
    expect(data.after).toEqual({ name: "관리자", rollbackPinHash: REDACTED });
    expect(data.before).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("secret");
  });
});
