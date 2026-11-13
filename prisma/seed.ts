/**
 * 기본 데이터: 약관 초안.
 * 약관·개인정보 처리방침 전문은 법률 검토 후 확정한다(명세 1.3). 새 버전을 넣으면
 * 시행일 이후 첫 로그인 때 재동의 화면이 뜬다.
 * 비밀값(운영 관리자 계정 등)은 여기에 쓰지 않는다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TermsKind } from "../src/generated/prisma/client";

const VERSION = "2026-11-13-draft";
const EFFECTIVE_AT = new Date("2026-11-12T15:00:00Z"); // 2026-11-13 00:00 KST

const TERMS: Array<{
  kind: TermsKind;
  title: string;
  required: boolean;
  body: string;
}> = [
  {
    kind: "SERVICE",
    title: "서비스 이용약관",
    required: true,
    body: "서비스 이용약관 전문은 법률 검토 후 확정됩니다.",
  },
  {
    kind: "PRIVACY",
    title: "개인정보 수집·이용",
    required: true,
    body: [
      "수집 항목: 아이디, 이름, 전화번호, (선택) 성별·생년월일, 수업·이용권 기록",
      "목적: 회원 식별, PT 일정·이용권·수업 완료 승인 관리, 알림 발송",
      "보관 기간: 탈퇴 신청 후 5일 동안 보관한 뒤 삭제",
      "전문은 법률 검토 후 확정됩니다.",
    ].join("\n"),
  },
  {
    kind: "THIRD_PARTY",
    title: "개인정보 제3자 제공",
    required: true,
    body: [
      "받는 자: 연결된 트레이너·수강생, 소속 센터",
      "제공 항목: 이름, 전화번호, 수업 기록",
      "목적: PT 일정·수업 관리",
      "전문은 법률 검토 후 확정됩니다.",
    ].join("\n"),
  },
  {
    kind: "NOTIFY",
    title: "수업 알림 수신 (웹 푸시·카카오톡)",
    required: true,
    body: "예약 확정 요청, 수업 안내, 완료 승인 요청 등 서비스 이용에 꼭 필요한 알림을 받습니다.",
  },
  {
    kind: "MARKETING",
    title: "마케팅 정보 수신",
    required: false,
    body: "이벤트·혜택 안내를 받습니다. 내 정보에서 언제든 바꿀 수 있습니다.",
  },
];

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  for (const t of TERMS) {
    await db.termsVersion.upsert({
      where: { kind_version: { kind: t.kind, version: VERSION } },
      update: {},
      create: { ...t, version: VERSION, effectiveAt: EFFECTIVE_AT },
    });
  }
  console.info(`약관 ${TERMS.length}종 준비 완료 (${VERSION})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
