/** 세션 쿠키 이름. 쿠키 값은 서버가 발급한 토큰이고 DB에는 해시로 저장한다(M1). */
export const SESSION_COOKIE = "pt_session";
/** 운영 관리자 세션은 회원 세션과 분리한다(자동 로그인 없음, 30분). */
export const ADMIN_SESSION_COOKIE = "pt_admin_session";
