import { describe, expect, it } from "vitest";
import {
  maskLoginId,
  validateLoginId,
  validatePassword,
  validatePin,
} from "./policy";

describe("아이디 정책", () => {
  it.each(["kim1", "abcd", "a1b2c3d4e5f6g7h8i9j0", "1234"])(
    "허용: %s",
    (id) => {
      expect(validateLoginId(id).ok).toBe(true);
    },
  );
  it.each([
    "abc", // 3자
    "a1b2c3d4e5f6g7h8i9j0k", // 21자
    "Kim123", // 대문자
    "kim_12",
    "김철수12",
    "kim 12",
    "",
  ])("거부: %s", (id) => {
    expect(validateLoginId(id).ok).toBe(false);
  });
});

describe("비밀번호 정책", () => {
  it.each(["abcd123!", "Passw0rd#", "a1!a1!a1!a1!a1!a1!a1"])(
    "허용: %s",
    (pw) => {
      expect(validatePassword(pw, "kim123")).toEqual({ ok: true });
    },
  );

  it("길이 8~20자", () => {
    expect(validatePassword("ab12!", "kim123").ok).toBe(false);
    expect(validatePassword("a1!a1!a1!a1!a1!a1!a1x", "kim123").ok).toBe(false);
  });

  it("영문·숫자·특수문자 모두 필요", () => {
    expect(validatePassword("abcdefgh", "kim123").ok).toBe(false);
    expect(validatePassword("abcd1234", "kim123").ok).toBe(false);
    expect(validatePassword("abcd!@#$", "kim123").ok).toBe(false);
    expect(validatePassword("1234!@#$", "kim123").ok).toBe(false);
  });

  it("아이디 포함 금지 (대소문자 무시)", () => {
    const r = validatePassword("xKIM123!", "kim123");
    expect(r).toEqual({
      ok: false,
      message: "비밀번호에 아이디를 넣을 수 없습니다",
    });
  });

  it("공백 금지", () => {
    expect(validatePassword("abc 123!x", "kim123").ok).toBe(false);
  });
});

describe("PIN 정책", () => {
  it.each(["1357", "2580", "0918", "7890", "1243"])("허용: %s", (pin) => {
    expect(validatePin(pin).ok).toBe(true);
  });

  it.each(["1111", "0000", "9999"])("반복 거부: %s", (pin) => {
    expect(validatePin(pin).ok).toBe(false);
  });

  it.each(["1234", "4321", "0123", "6789", "9876", "3210"])(
    "연속 거부: %s",
    (pin) => {
      expect(validatePin(pin).ok).toBe(false);
    },
  );

  it.each(["123", "12345", "12a4", " 135", ""])("형식 거부: %s", (pin) => {
    expect(validatePin(pin).ok).toBe(false);
  });

  it("생년월일 뒤 4자리(MMDD) 거부", () => {
    expect(validatePin("0918", "1990-09-18")).toEqual({
      ok: false,
      message: "생년월일 뒤 4자리는 PIN으로 쓸 수 없습니다",
    });
    expect(validatePin("0918", "1990-09-19").ok).toBe(true);
    expect(validatePin("0918", null).ok).toBe(true);
  });
});

describe("아이디 마스킹", () => {
  it("앞 3자만 보인다", () => {
    expect(maskLoginId("kimcs1")).toBe("kim***");
    expect(maskLoginId("abcd")).toBe("abc***");
    expect(maskLoginId("abc")).toBe("a***");
  });
});
