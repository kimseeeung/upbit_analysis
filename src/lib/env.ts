/**
 * 환경 변수 읽기. 비밀값(운영 관리자 계정, 롤백 PIN, VAPID·SMS·카카오 키)은
 * 코드·문서·시드에 쓰지 않고 반드시 여기서만 읽는다. 값은 로그에 남기지 않는다.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `환경 변수 ${name}가 설정되지 않았습니다 (.env.example 참고)`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}
