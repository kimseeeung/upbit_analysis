import { expect, test } from "@playwright/test";
import { signupViaUi, uniq } from "./helpers";

test("임시 등록 → 이용권 등록 → 수강생 가입 시 합치기 → 규칙 동의", async ({
  page,
  browser,
}) => {
  // 트레이너 가입
  const t = uniq();
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: `김코치${t.id}`,
  });

  // 미가입 수강생 임시 등록
  const s = uniq();
  await page.goto("/t/students");
  await page.getByRole("button", { name: "수강생 등록" }).click();
  await page.getByRole("button", { name: "미가입 수강생 임시 등록" }).click();
  await page.getByLabel("이름", { exact: true }).fill(`박수강${s.id}`);
  await page.getByLabel("전화번호").fill(s.phone);
  await page.getByRole("button", { name: "임시 등록", exact: true }).click();
  await expect(page.getByText("임시 등록했습니다")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`박수강${s.id}`) }).click();
  await expect(page.getByText("등록한 이용권이 없습니다")).toBeVisible();

  // 이용권 등록 (만료일 자동 제안)
  await page.getByRole("link", { name: "이용권 관리" }).click();
  await page.getByRole("button", { name: "이용권 추가" }).click();
  await page.getByLabel("이용권명").fill("PT 20회 (2026 겨울)");
  await expect(page.getByText("횟수에 맞춰 제안한 날짜")).toBeVisible();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("이용권을 등록했습니다")).toBeVisible();
  await expect(page.getByText("잔여 20 / 20회")).toBeVisible();
  await expect(
    page.getByText(/미동의: 노쇼·당일 취소를 차감하지 않습니다/),
  ).toBeVisible();

  // 목록에 규칙 미동의 표시
  await page.goto("/t/students");
  const row = page.getByRole("link", { name: new RegExp(`박수강${s.id}`) });
  await expect(row.getByText("규칙 미동의")).toBeVisible();
  await expect(row.getByText(/수강 중 · 잔여 20회/)).toBeVisible();

  // 수강생이 같은 번호로 가입 → 합치기
  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await signupViaUi(sp, {
    role: "수강생",
    loginId: `st${s.id}`,
    phone: s.phone,
    name: `박수강${s.id}`,
    trainerName: `김코치${t.id}`,
  });
  await expect(sp).toHaveURL(/\/onboarding\/merge/);
  await expect(
    sp.getByText(`김코치${t.id} 트레이너의 수강생이 맞나요?`),
  ).toBeVisible();
  await sp.getByRole("button", { name: "네, 맞아요" }).click();
  await expect(sp).toHaveURL(/\/onboarding\/notifications/);

  // 수강생: 이용권 확인, 요청함에서 규칙 동의
  await sp.goto("/s/passes");
  await expect(sp.getByText("잔여 20 / 20회")).toBeVisible();
  await sp.goto("/s/requests");
  await expect(
    sp.getByText("수강 규칙 동의 · PT 20회 (2026 겨울)"),
  ).toBeVisible();
  await expect(
    sp.getByText("수업 24시간 전 이후에 취소하면 1회 차감됩니다"),
  ).toBeVisible();
  await sp.getByRole("button", { name: "동의", exact: true }).click();
  await expect(sp.getByText("처리할 요청이 없습니다")).toBeVisible();
  await ctx.close();

  // 트레이너 목록: 미동의 표시 사라짐
  await page.goto("/t/students");
  await expect(
    page.getByRole("link", { name: new RegExp(`박수강${s.id}`) }),
  ).toBeVisible();
  await expect(page.getByText("규칙 미동의")).toHaveCount(0);
});

test("수강생이 가입 때 고른 트레이너가 요청함에서 수락", async ({
  page,
  browser,
}) => {
  const t = uniq();
  const trainerName = `이코치${t.id}`;
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: trainerName,
  });

  const s = uniq();
  const ctx = await browser.newContext();
  await signupViaUi(await ctx.newPage(), {
    role: "수강생",
    loginId: `st${s.id}`,
    phone: s.phone,
    name: `최수강${s.id}`,
    trainerName,
  });
  await ctx.close();

  await page.goto("/t/requests");
  await expect(page.getByText(`최수강${s.id} 수강생`)).toBeVisible();
  await page.getByRole("button", { name: "수락" }).click();
  await expect(page.getByText("처리할 요청이 없습니다")).toBeVisible();
  await page.goto("/t/students");
  await expect(
    page.getByRole("link", { name: new RegExp(`최수강${s.id}`) }),
  ).toBeVisible();
});

test("수강 규칙 기본값 설정", async ({ page }) => {
  const t = uniq();
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: `정코치${t.id}`,
  });
  await page.goto("/t/settings");
  await expect(page.getByText("수강 규칙 (기본) · v1")).toBeVisible();
  await page.getByLabel("당일 취소 기준").selectOption("12");
  await expect(
    page.getByText("수업 12시간 전 이후에 취소하면 1회 차감됩니다"),
  ).toBeVisible();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("수강 규칙 (기본) · v2")).toBeVisible();
});
