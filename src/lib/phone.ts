/** 전화번호 정규화·표시. DB에는 숫자만 저장한다(01012345678). */

/** 숫자만 남긴다. +82 10… 형식도 010…으로 바꾼다. */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

/** 휴대폰 번호인가 (010은 11자리, 011·016~019는 10~11자리) */
export function isValidMobilePhone(input: string): boolean {
  const d = normalizePhone(input);
  return /^010\d{8}$/.test(d) || /^01[16789]\d{7,8}$/.test(d);
}

/** 010-1234-5678 */
export function formatPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/** 목록·검색용 마스킹: 010-****-5678 (명세 3.1, 13) */
export function maskPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length < 8) return "****";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}
