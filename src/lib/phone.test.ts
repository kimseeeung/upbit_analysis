import { describe, expect, it } from "vitest";
import {
  formatPhone,
  isValidMobilePhone,
  maskPhone,
  normalizePhone,
} from "./phone";

describe("전화번호", () => {
  it("숫자만 남기고 +82를 0으로", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("+82 10 1234 5678")).toBe("01012345678");
  });
  it("휴대폰 번호 검사", () => {
    expect(isValidMobilePhone("010-1234-5678")).toBe(true);
    expect(isValidMobilePhone("011-123-4567")).toBe(true);
    expect(isValidMobilePhone("02-123-4567")).toBe(false);
    expect(isValidMobilePhone("010-1234-567")).toBe(false);
  });
  it("표시와 마스킹", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(maskPhone("01012345678")).toBe("010-****-5678");
  });
});
