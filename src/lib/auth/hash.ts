/**
 * 비밀번호·PIN·인증번호 해시. PBKDF2-HMAC-SHA256, 반복 600,000, 솔트 16바이트.
 * SHA-256 한 번만 쓰는 해시는 금지(CLAUDE.md).
 *
 * 해시 문자열에 알고리즘과 반복 횟수를 함께 적어 두어, 나중에 반복 횟수를
 * 올려도 이전 해시를 검증할 수 있다: "pbkdf2-sha256$600000$<base64>"
 */

import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = "pbkdf2-sha256";

export interface HashedSecret {
  hash: string;
  salt: string;
}

export async function hashSecret(
  secret: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<HashedSecret> {
  const salt = randomBytes(SALT_BYTES);
  const key = await pbkdf2Async(secret, salt, iterations, KEY_BYTES, "sha256");
  return {
    hash: `${PREFIX}$${iterations}$${key.toString("base64")}`,
    salt: salt.toString("base64"),
  };
}

export async function verifySecret(
  secret: string,
  stored: HashedSecret,
): Promise<boolean> {
  const [prefix, iterText, keyB64] = stored.hash.split("$");
  const iterations = Number(iterText);
  if (prefix !== PREFIX || !Number.isInteger(iterations) || !keyB64) {
    return false;
  }
  const expected = Buffer.from(keyB64, "base64");
  const salt = Buffer.from(stored.salt, "base64");
  const actual = await pbkdf2Async(
    secret,
    salt,
    iterations,
    expected.length,
    "sha256",
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
