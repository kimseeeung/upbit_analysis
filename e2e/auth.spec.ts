import { expect, test } from "@playwright/test";
import { signupViaUi, uniq, verifyPhone } from "./helpers";

test("트레이너 가입 → 안내 → 근무 시간(나중에) → 트레이너 홈", async ({
  page,
}) => {
  const u = uniq();
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `tr${u.id}`,
    phone: u.phone,
    name: `김트레${u.id}`,
  });
  await expect(
    page.getByRole("heading", { name: "알림 허용 · 홈 화면 추가" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/onboarding\/availability/);
  await page.getByRole("link", { name: "나중에 하기" }).click();
  await expect(page).toHaveURL(/\/t$/);
  await expect(page.getByText(`김트레${u.id}님`)).toBeVisible();
});

test("수강생 가입(트레이너 검색) → 로그아웃 → 자동 로그인 → 기기 목록", async ({
  page,
  browser,
}) => {
  // 담당 트레이너를 먼저 가입시킨다 (다른 브라우저 세션)
  const t = uniq();
  const trainerName = `박코치${t.id}`;
  const ctx = await browser.newContext();
  await signupViaUi(await ctx.newPage(), {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: trainerName,
  });
  await ctx.close();

  const s = uniq();
  await signupViaUi(page, {
    role: "수강생",
    loginId: `st${s.id}`,
    phone: s.phone,
    name: `이수강${s.id}`,
    trainerName,
  });
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/s");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole("radio", { name: "수강생" }).click();
  await page.getByLabel("아이디", { exact: true }).fill(`st${s.id}`);
  await page.getByLabel("비밀번호", { exact: true }).fill("abcd123!");
  await page.getByLabel("자동 로그인").check();
  await expect(page.getByText("공용 기기에서는 사용하지 마세요")).toBeVisible();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/s$/);

  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "pt_session");
  expect(session?.httpOnly).toBe(true);
  // 30일 쿠키 (자동 로그인)
  expect(session!.expires * 1000 - Date.now()).toBeGreaterThan(
    29 * 24 * 3600 * 1000,
  );
  // 비밀번호는 기기에 저장하지 않는다
  expect(JSON.stringify(cookies)).not.toContain("abcd123!");

  await page.goto("/s/me");
  await expect(page.getByText("로그인된 기기")).toBeVisible();
  await expect(page.getByText("이 기기")).toBeVisible();
  await expect(page.getByText("수업 완료 승인 PIN")).toBeVisible();

  // 수강생은 트레이너 화면에 못 들어간다 (서버 검사 → 자기 홈으로)
  await page.goto("/t");
  await expect(page).toHaveURL(/\/s$/);

  await page.goto("/s/me");
  await page.getByRole("button", { name: "모든 기기에서 로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/s");
  await expect(page).toHaveURL(/\/login/);
});

test("로그인 5회 실패하면 10분 잠긴다", async ({ page }) => {
  const u = uniq();
  await signupViaUi(page, {
    role: "센터 관리자",
    loginId: `ca${u.id}`,
    phone: u.phone,
    name: `최센터${u.id}`,
  });
  await page.context().clearCookies();

  await page.goto("/login");
  await page.getByRole("radio", { name: "센터 관리자" }).click();
  await page.getByLabel("아이디", { exact: true }).fill(`ca${u.id}`);
  const pw = page.getByLabel("비밀번호", { exact: true });
  const submit = page.getByRole("button", { name: "로그인", exact: true });
  for (let i = 0; i < 4; i++) {
    await pw.fill(`wrong${i}!aa`);
    await submit.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "아이디 또는 비밀번호가 맞지 않습니다" }),
    ).toBeVisible();
  }
  await pw.fill("wrong5!aa");
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "10분 동안 잠겼습니다" }),
  ).toBeVisible();
  await pw.fill("abcd123!");
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "잠겼습니다" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("아이디 찾기 → 비밀번호 재설정 → 새 비밀번호로 로그인", async ({
  page,
}) => {
  // 같은 번호의 인증번호 재발송은 30초 뒤부터라 기다리는 시간이 있다
  test.setTimeout(150_000);
  const u = uniq();
  const name = `정회원${u.id}`;
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `kim${u.id}`,
    phone: u.phone,
    name,
  });
  await page.context().clearCookies();

  await page.waitForTimeout(31_000);
  await page.goto("/find-id");
  await page.getByRole("radio", { name: "트레이너" }).click();
  await page.getByLabel("이름", { exact: true }).fill(name);
  await verifyPhone(page, u.phone);
  await page.getByRole("button", { name: "아이디 찾기" }).click();
  await expect(page.getByText("kim***")).toBeVisible();

  await page.goto("/reset-password");
  await page.getByLabel("아이디", { exact: true }).fill(`kim${u.id}`);
  // 같은 번호는 30초 뒤 재발송이므로 기다린다
  await page.waitForTimeout(31_000);
  await verifyPhone(page, u.phone);
  await page.getByLabel("새 비밀번호", { exact: true }).fill("abcd123!");
  await page.getByLabel("새 비밀번호 확인").fill("abcd123!");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "직전에 쓰던 비밀번호는 다시 쓸 수 없습니다" }),
  ).toBeVisible();
  await page.getByLabel("새 비밀번호", { exact: true }).fill("newpass7#");
  await page.getByLabel("새 비밀번호 확인").fill("newpass7#");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page.getByText("비밀번호를 바꿨습니다")).toBeVisible();

  await page.goto("/login");
  await page.getByRole("radio", { name: "트레이너" }).click();
  await page.getByLabel("아이디", { exact: true }).fill(`kim${u.id}`);
  await page.getByLabel("비밀번호", { exact: true }).fill("newpass7#");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/t$/);
});
