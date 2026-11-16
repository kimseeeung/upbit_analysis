import { expect, test } from "@playwright/test";

test("첫 화면은 바로 로그인", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("아이디", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "회원가입" })).toBeVisible();
});

test("헬스 체크가 응답한다", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

for (const path of ["/t", "/s/requests", "/c"]) {
  test(`로그인 없이 ${path}에 들어가면 로그인 화면으로 간다`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(
      page.getByRole("heading", { name: "로그인", exact: true }),
    ).toBeVisible();
  });
}

test("로그인 없이 /admin에 들어가면 관리자 로그인으로 간다", async ({
  page,
}) => {
  await page.goto("/admin/versions");
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
});
