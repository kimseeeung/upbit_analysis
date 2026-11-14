/**
 * 계정 목록 (npm run accounts:list 가 서버 DB에 연결해 실행).
 * 화면에 표로 보여 주고 accounts-list.txt 로도 저장한다 (커밋 안 함).
 * 비밀번호는 암호화되어 있어 볼 수 없다. 테스트 비밀번호(12345!)와 같은 계정만 표시한다.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { verifySecret } from "@/lib/auth/hash";
import { getDb } from "@/lib/db";

const TEST_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD ?? "12345!";
const ROLE = {
  TRAINER: "트레이너",
  STUDENT: "수강생",
  CENTER_ADMIN: "센터 관리자",
} as const;
const STATUS = {
  ACTIVE: "정상",
  WITHDRAWING: "탈퇴 신청",
  DELETED: "탈퇴",
} as const;

function fmtPhone(p: string) {
  return p.length === 11
    ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
    : p;
}

async function main() {
  const db = getDb();
  const now = new Date();
  const lines: string[] = [];
  const out = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  out(
    `머슬매니아 계정 목록 (${now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})`,
  );
  out(
    "주소: https://pt.rest-wifi.co.kr  /  운영 관리자: https://pt.rest-wifi.co.kr/admin",
  );
  out("인증번호: 000000 (문자 업체 연결 전)");
  out();

  const ops = await db.operatorAccount.findMany({
    orderBy: { createdAt: "asc" },
  });
  out("[운영 관리자]");
  out(["아이디", "이름", "휴대폰", "상태", "잠김"].join("\t"));
  for (const o of ops)
    out(
      [
        o.loginId ?? "(초대 대기)",
        o.name,
        fmtPhone(o.phone),
        { ACTIVE: "활성", INVITED: "초대 대기", DISABLED: "비활성" }[o.status],
        o.lockedUntil && o.lockedUntil > now ? "잠김" : "-",
      ].join("\t"),
    );
  out();

  const users = await db.user.findMany({
    where: { status: { not: "DELETED" } },
    orderBy: [{ role: "asc" }, { loginId: "asc" }],
    include: { student: true },
  });
  const trainerName = new Map(
    users
      .filter((u) => u.role === "TRAINER")
      .map((u) => [u.id, `${u.name}(${u.loginId})`]),
  );
  out("[회원]");
  out(
    [
      "유형",
      "아이디",
      "비밀번호",
      "이름",
      "휴대폰",
      "담당 트레이너",
      "상태",
      "잠김",
    ].join("\t"),
  );
  for (const u of users) {
    const isTest = await verifySecret(TEST_PASSWORD, {
      hash: u.passwordHash,
      salt: u.passwordSalt,
    });
    out(
      [
        ROLE[u.role],
        u.loginId,
        isTest ? TEST_PASSWORD : "(본인 설정)",
        u.name,
        fmtPhone(u.phone),
        u.role === "STUDENT"
          ? u.student?.currentTrainerId
            ? (trainerName.get(u.student.currentTrainerId) ?? "-")
            : "없음"
          : "-",
        STATUS[u.status],
        u.lockedUntil && u.lockedUntil > now ? "잠김" : "-",
      ].join("\t"),
    );
  }
  out();
  out(`회원 ${users.length}명 · 운영 관리자 ${ops.length}명`);
  writeFileSync("accounts-list.txt", lines.join("\n") + "\n");
  console.log(
    "\n저장: accounts-list.txt (메모장·엑셀에 붙여 넣기 좋게 탭으로 구분)",
  );
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
