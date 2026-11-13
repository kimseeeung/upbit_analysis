/** 아이디·비밀번호·PIN 정책 (명세 1.1). 오류 문구는 그대로 화면에 쓴다. */

export type PolicyResult = { ok: true } | { ok: false; message: string };

const OK: PolicyResult = { ok: true };
const fail = (message: string): PolicyResult => ({ ok: false, message });

/** 영문 소문자·숫자 4~20자 */
export function validateLoginId(loginId: string): PolicyResult {
  if (!/^[a-z0-9]{4,20}$/.test(loginId)) {
    return fail("아이디는 영문 소문자와 숫자로 4~20자여야 합니다");
  }
  return OK;
}

/** 8~20자, 영문·숫자·특수문자 모두 포함, 아이디 포함 금지 */
export function validatePassword(
  password: string,
  loginId: string,
): PolicyResult {
  if (password.length < 8 || password.length > 20) {
    return fail("비밀번호는 8~20자여야 합니다");
  }
  if (/\s/.test(password)) {
    return fail("비밀번호에 공백을 쓸 수 없습니다");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return fail("비밀번호에 영문, 숫자, 특수문자를 모두 넣어 주세요");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return fail("비밀번호에 영문, 숫자, 특수문자를 모두 넣어 주세요");
  }
  if (loginId && password.toLowerCase().includes(loginId.toLowerCase())) {
    return fail("비밀번호에 아이디를 넣을 수 없습니다");
  }
  return OK;
}

/** 같은 숫자 반복(1111)인가 */
function isRepeated(pin: string): boolean {
  return /^(\d)\1+$/.test(pin);
}

/** 1씩 오르거나 내리는 연속(1234, 4321, 7890은 아님)인가 */
function isSequential(pin: string): boolean {
  const d = [...pin].map(Number);
  const up = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const down = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return up || down;
}

/**
 * 수업 완료 승인 PIN: 숫자 4자리. 반복·연속 금지.
 * 생년월일을 입력했다면 생년월일 뒤 4자리(MMDD)와 같으면 금지.
 * birthDate는 "YYYY-MM-DD"(한국 날짜).
 */
export function validatePin(
  pin: string,
  birthDate?: string | null,
): PolicyResult {
  if (!/^\d{4}$/.test(pin)) {
    return fail("PIN은 숫자 4자리여야 합니다");
  }
  if (isRepeated(pin)) {
    return fail("같은 숫자를 반복한 PIN은 쓸 수 없습니다");
  }
  if (isSequential(pin)) {
    return fail("1234, 4321처럼 연속된 PIN은 쓸 수 없습니다");
  }
  if (birthDate) {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthDate);
    if (m && pin === `${m[1]}${m[2]}`) {
      return fail("생년월일 뒤 4자리는 PIN으로 쓸 수 없습니다");
    }
  }
  return OK;
}

/** 아이디 찾기 결과 마스킹: 앞 3자만 보이고 나머지 *** (kim***) */
export function maskLoginId(loginId: string): string {
  const visible =
    loginId.length <= 3 ? loginId.slice(0, 1) : loginId.slice(0, 3);
  return `${visible}***`;
}
