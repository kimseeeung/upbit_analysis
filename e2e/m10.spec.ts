import { randomBytes, randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashSecret } from "../src/lib/auth/hash";
import { validateRollbackPin } from "../src/lib/admin/rules";
import { lastSmsCode, uniq, withE2eDb } from "./helpers";

// 배포 버전·점검 표시는 서비스 전체에 하나뿐이라 한 브라우저 설정에서만 돌린다
test.skip(({ isMobile }) => isMobile, "PC 화면에서만");

/** 테스트마다 새 관리자 (비밀값은 코드에 적지 않고 매번 만든다) */
async function makeOperator() {
  const u = uniq();
  let pin = "";
  do pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  while (!validateRollbackPin(pin).ok);
  const password = `Op${randomBytes(4).toString("hex")}!9`;
  const loginId = `op${u.id}`;
  const pw = await hashSecret(password);
  const ph = await hashSecret(pin);
  const id = `e2eop${u.id}`;
  await withE2eDb((c) =>
    c.query(
      `INSERT INTO "OperatorAccount" (id, "loginId", "passwordHash", "passwordSalt", "rollbackPinHash", "rollbackPinSalt", name, phone, status, "activatedAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',now(),now())`,
      [id, loginId, pw.hash, pw.salt, ph.hash, ph.salt, `운영${u.id}`, u.phone],
    ),
  );
  return { id, loginId, password, pin, phone: u.phone, name: `운영${u.id}` };
}

async function adminLogin(
  page: Page,
  op: { loginId: string; password: string; phone: string },
) {
  await page.goto("/admin/login");
  await page.getByLabel("아이디").fill(op.loginId);
  await page.getByLabel("비밀번호", { exact: true }).fill(op.password);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText(/등록된 휴대폰/)).toBeVisible();
  await page
    .getByLabel("인증번호")
    .fill(await lastSmsCode(page.request, op.phone));
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/versions/);
}

test("관리자 2단계 로그인 → 롤백 PIN 확인 → 롤백 → 점검 결과 → 다시 최신으로", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const op = await makeOperator();
  const tag = randomBytes(3).toString("hex");
  const [oldV, newV] = [`e2e-${tag}-1`, `e2e-${tag}-2`];
  await withE2eDb(async (c) => {
    // 이전 실행의 버전 기록이 섞이지 않도록 비운다 (이 테스트만 버전을 다룸)
    await c.query(`DELETE FROM "DeployVersion"`);
    await c.query(
      `INSERT INTO "DeployVersion" (id, version, "deployedAt", "deployedBy", summary, "isCurrent") VALUES
       ($1,$2, now() - interval '2 hour', '배포 시스템', '첫 배포', false),
       ($3,$4, now() - interval '1 hour', '배포 시스템', '알림 개선', true)`,
      [`dv${tag}1`, oldV, `dv${tag}2`, newV],
    );
  });

  // 로그인 없이 들어오면 관리자 로그인으로
  await page.goto("/admin/versions");
  await expect(page).toHaveURL(/\/admin\/login/);
  await adminLogin(page, op);

  await expect(page.locator("tr", { hasText: newV })).toContainText(
    "지금 버전",
  );
  await page
    .getByRole("button", { name: `직전 버전으로 롤백 (${oldV})` })
    .click();
  const dlg = page.getByRole("dialog", { name: "롤백 확인" });
  await expect(dlg).toContainText(`${newV} → ${oldV}`);
  await dlg.getByLabel("사유").fill("로그인 오류");
  const wrong = op.pin === "135790" ? "246802" : "135790";
  await dlg.getByLabel("롤백 PIN").fill(wrong);
  await dlg.getByRole("button", { name: "롤백 실행" }).click();
  await expect(
    dlg.getByText("롤백 PIN이 맞지 않습니다 (남은 횟수 4회)"),
  ).toBeVisible();

  await dlg.getByLabel("롤백 PIN").fill(op.pin);
  await dlg.getByRole("button", { name: "롤백 실행" }).click();
  await expect(dlg.getByText(`${newV} → ${oldV} 완료 · 점검 통과`)).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(dlg.getByRole("list", { name: "점검 결과" })).toContainText(
    "캘린더 조회",
  );
  await dlg.getByLabel("닫기").click();
  await expect(page.locator("tr", { hasText: oldV })).toContainText(
    "지금 버전",
  );

  await page
    .getByRole("button", { name: `다시 최신 버전으로 (${newV})` })
    .click();
  await dlg.getByLabel("사유").fill("수정 확인");
  await dlg.getByLabel("롤백 PIN").fill(op.pin);
  await dlg.getByRole("button", { name: "롤백 실행" }).click();
  await expect(dlg.getByText(`${oldV} → ${newV} 완료 · 점검 통과`)).toBeVisible(
    { timeout: 30_000 },
  );
  await dlg.getByLabel("닫기").click();
  await expect(page.getByText(`${op.name} · ${oldV} → ${newV}`)).toBeVisible();
});

test("관리자 초대 → 초대받은 사람이 직접 설정·인증 → 비활성화, 마지막 한 명은 유지", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const op = await makeOperator();
  await adminLogin(page, op);
  await page.getByRole("link", { name: "관리자" }).click();
  const invitee = uniq();
  await page.getByLabel("이름").fill(`초대${invitee.id}`);
  await page.getByLabel("휴대폰 번호").fill(invitee.phone);
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const url = (await page.getByTestId("invite-url").textContent())!.trim();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await expect(
    p2.getByText(`초대${invitee.id}님, 운영 관리자로 초대되었습니다.`),
  ).toBeVisible();
  const loginId = `inv${invitee.id}`;
  const password = `Iv${randomBytes(4).toString("hex")}!7`;
  await p2.getByLabel("아이디").fill(loginId);
  await p2.getByLabel("비밀번호", { exact: true }).fill(password);
  await p2.getByLabel("비밀번호 확인").fill(password);
  await p2.getByLabel("롤백 PIN (숫자 6자리)").fill("314159");
  await p2.getByRole("button", { name: "인증번호 받기" }).click();
  await p2
    .getByLabel("인증번호")
    .fill(await lastSmsCode(p2.request, invitee.phone));
  await p2.getByRole("button", { name: "인증 확인" }).click();
  await expect(p2.getByText("인증되었습니다")).toBeVisible();
  await p2.getByRole("button", { name: "활성화" }).click();
  await expect(p2).toHaveURL(/\/admin\/login/);
  // 같은 번호로 방금 인증번호를 받았으므로 다시 받을 수 있을 때까지 (30초)
  await p2.waitForTimeout(31_000);
  await adminLogin(p2, { loginId, password, phone: invitee.phone });

  // 첫 관리자 화면: 활성, 알림 도착
  await page.reload();
  const row = page.locator(`tr[data-operator="초대${invitee.id}"]`);
  await expect(row).toContainText("활성");
  await expect(
    page.getByText(`초대${invitee.id}님이 운영 관리자로 활성화되었습니다`),
  ).toBeVisible();

  // 새 관리자가 첫 관리자를 비활성화 → 첫 관리자 세션 끝
  await p2.goto("/admin/operators");
  p2.once("dialog", (d) => d.accept());
  await p2
    .locator(`tr[data-operator="${op.name}"]`)
    .getByRole("button", { name: "비활성화" })
    .click();
  await expect(p2.getByText("처리했습니다")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login/);
  await ctx.close();
});

test("회원 정지: 조회 기록이 남고, 정지된 회원은 로그인할 수 없다 · 공지·문의", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { signupViaUi } = await import("./helpers");
  const mc = await browser.newContext();
  const member = await mc.newPage();
  const u = uniq();
  await signupViaUi(member, {
    role: "트레이너",
    loginId: `tr${u.id}`,
    phone: u.phone,
    name: `정지대상${u.id}`,
  });
  // 회원이 문의
  await member.goto("/me/inquiries");
  await member.getByLabel("제목").fill(`문의${u.id}`);
  await member.getByLabel("내용").fill("이용권 환불 가능한가요?");
  await member.getByRole("button", { name: "보내기" }).click();
  await expect(member.getByText("답변 대기")).toBeVisible();

  const op = await makeOperator();
  await adminLogin(page, op);
  // 공지 게시
  await page.getByRole("link", { name: "공지사항" }).click();
  await page.getByLabel("제목").fill(`공지${u.id}`);
  await page.getByLabel("내용").fill("점검 안내입니다");
  await page.getByRole("button", { name: "게시" }).click();
  await expect(page.getByText(`공지${u.id}`)).toBeVisible();
  // 문의 답변
  await page.getByRole("link", { name: "문의" }).click();
  const item = page.locator("li", { hasText: `문의${u.id}` });
  await item.getByLabel("답변").fill("트레이너와 상의해 주세요");
  await item.getByRole("button", { name: "답변 등록" }).click();
  await expect(item).toHaveCount(0); // 답변 전만 보기에서 빠짐

  await member.goto("/me/notices");
  await expect(member.getByText(`공지${u.id}`)).toBeVisible();
  await member.goto("/me/inquiries");
  await expect(
    member.getByText("답변: 트레이너와 상의해 주세요"),
  ).toBeVisible();

  // 회원 조회 → 정지
  await page.getByRole("link", { name: "회원 조회" }).click();
  await page.getByLabel("이름·아이디·전화번호 뒷자리").fill(`tr${u.id}`);
  await page.getByRole("button", { name: "검색" }).click();
  await page
    .getByRole("button", { name: /트레이너/ })
    .first()
    .click();
  await expect(page.getByText(`${op.name} · 조회`)).toBeVisible();
  await page.getByLabel("정지 사유").fill("부정 이용");
  await page.getByRole("button", { name: "정지", exact: true }).click();
  await expect(page.getByText("정지했습니다")).toBeVisible();

  await member.goto("/t");
  await expect(member).toHaveURL(/\/login/);
  await mc.close();
});
