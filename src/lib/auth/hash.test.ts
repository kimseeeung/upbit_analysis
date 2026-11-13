import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS, hashSecret, verifySecret } from "./hash";

describe("PBKDF2 해시", () => {
  it("600,000회 PBKDF2-SHA256, 솔트 16바이트", async () => {
    const h = await hashSecret("abcd123!");
    expect(h.hash.startsWith(`pbkdf2-sha256$${PBKDF2_ITERATIONS}$`)).toBe(true);
    expect(Buffer.from(h.salt, "base64")).toHaveLength(16);
    expect(h.hash).not.toContain("abcd123!");
  });

  it("맞는 값만 통과", async () => {
    const h = await hashSecret("abcd123!");
    expect(await verifySecret("abcd123!", h)).toBe(true);
    expect(await verifySecret("abcd123?", h)).toBe(false);
  });

  it("같은 값도 솔트가 달라 해시가 다르다", async () => {
    const [a, b] = await Promise.all([hashSecret("1357"), hashSecret("1357")]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("저장된 반복 횟수로 검증한다 (반복 횟수를 올려도 이전 해시 검증)", async () => {
    const old = await hashSecret("1357", 1000);
    expect(old.hash.startsWith("pbkdf2-sha256$1000$")).toBe(true);
    expect(await verifySecret("1357", old)).toBe(true);
  });

  it("형식이 다른 해시는 거부한다", async () => {
    expect(await verifySecret("x", { hash: "sha256$abc", salt: "AA==" })).toBe(
      false,
    );
  });
});
