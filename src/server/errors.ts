/** 화면에 그대로 보여 줄 수 있는 업무 오류. message는 한국어 문구. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const LOGIN_FAILED_MESSAGE = "아이디 또는 비밀번호가 맞지 않습니다";
