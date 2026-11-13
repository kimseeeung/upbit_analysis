# PT 관리앱

트레이너와 수강생이 PT 일정·이용권·수업 완료 승인을 함께 관리하는 모바일 웹(PWA) 서비스.
명세는 [`docs/`](docs), 개발 규칙은 [`CLAUDE.md`](CLAUDE.md)를 봅니다.

## 개발 환경

- Node.js 22, PostgreSQL 16

```bash
cp .env.example .env   # DATABASE_URL 등 채우기
npm install            # prisma generate 자동 실행
npm run db:migrate     # 로컬 DB에 마이그레이션 적용
npm run db:seed        # 약관 초안 등록
npm run dev
```

## 명령

| 명령                                 | 내용                                    |
| ------------------------------------ | --------------------------------------- |
| `npm test`                           | Vitest 단위 테스트 (규칙·계산)          |
| `npm run test:e2e`                   | Playwright (빌드 후 3100 포트에서 실행) |
| `npm run lint` / `npm run typecheck` | ESLint / 타입 검사                      |
| `npm run format`                     | Prettier                                |
| `npm run db:deploy`                  | 운영 DB 마이그레이션 적용               |

## 구조 (M0)

| 경로                     | 내용                                                   |
| ------------------------ | ------------------------------------------------------ |
| `src/lib/time.ts`        | 한국 시간(Asia/Seoul) 계산·표시. DB는 UTC              |
| `src/lib/audit.ts`       | 감사 로그 헬퍼. 비밀번호·PIN·토큰 필드는 자동으로 가림 |
| `src/lib/auth/access.ts` | 경로 영역·역할 권한 판단(순수 함수)                    |
| `src/lib/auth/guard.ts`  | 서버에서 매 요청 권한 검사 (`requireArea`)             |
| `src/proxy.ts`           | 로그인 쿠키 없으면 로그인 화면으로 (1차 관문)          |
| `src/lib/env.ts`         | 환경 변수 읽기. 비밀값은 여기서만                      |
| `prisma/schema.prisma`   | DB 스키마. 마이그레이션은 이전 버전과 호환되게         |

## 구조 (M1)

| 경로                            | 내용                                               |
| ------------------------------- | -------------------------------------------------- |
| `src/lib/auth/hash.ts`          | PBKDF2-SHA256 60만 회 해시 (비밀번호·PIN·인증번호) |
| `src/lib/auth/policy.ts`        | 아이디·비밀번호·PIN 정책                           |
| `src/lib/auth/lockout.ts`       | 연속 실패 잠금 (로그인 10분, PIN 재설정까지)       |
| `src/lib/auth/session-rules.ts` | 세션 30일 슬라이딩, 토큰                           |
| `src/lib/auth/sms-rules.ts`     | 인증번호 3분·30초·하루 5회·5회 오류                |
| `src/server/auth/*`             | 가입·로그인·세션·계정·약관 서비스 (DB)             |
| `src/server/sms/sender.ts`      | SMS 어댑터 (개발용 콘솔)                           |
| `src/app/api/**`                | Route Handler. 권한은 매 요청 서버에서 검사        |
