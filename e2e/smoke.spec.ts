import { expect, test } from "@playwright/test";

test("시작 화면이 열린다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "머슬매니아" })).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
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
