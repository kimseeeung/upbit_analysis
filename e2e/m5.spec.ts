import { expect, test, type Page } from "@playwright/test";
import {
  api,
  cronTick,
  insertPastBooking,
  nextWeekday,
  signupViaUi,
  uniq,
} from "./helpers";

const NIGHT_NOTICE =
  "※ 정보통신망법 제50조 제3항에 따라 오후 9시부터 다음 날 오전 8시까지는 별도 동의 없이 광고성 정보를 보낼 수 없습니다. 이 서비스는 수업 안내 알림도 같은 시간에는 보내지 않습니다.";

/** 야간이면 확인창 문구를 확인하고 "보내기" */
function acceptNightConfirm(page: Page) {
  page.on("dialog", async (d) => {
    expect(d.message()).toBe("지금은 야간 시간입니다. 그래도 보낼까요?");
    await d.accept();
  });
}

test("전일 알림 시각 설정과 야간 주석 문구", async ({ page }) => {
  const t = uniq();
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: `알림코치${t.id}`,
  });
  await page.goto("/t/settings");
  await expect(page.getByText(NIGHT_NOTICE).first()).toBeVisible();
  const select = page.getByLabel("전일 수업 알림 시각");
  await expect(select.locator("option")).toHaveCount(26);
  await expect(select.locator("option").last()).toHaveText("20:30");
  await select.selectOption("19:30");
  await expect(page.getByText("저장했습니다")).toBeVisible();
  const r = await api(page, "GET", "/api/t/settings/notify");
  expect(r.dayBeforeNotifyTime).toBe("19:30");
});

test("미가입 수강생: 카톡 링크로 예약 수락·규칙 동의, 가입 후 링크에서 완료 승인", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  acceptNightConfirm(page);
  const t = uniq();
  await signupViaUi(page, {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: `카톡코치${t.id}`,
  });

  // 미가입 수강생 임시 등록 + 이용권 + 다음 주 예약 (API로 빠르게)
  const s = uniq();
  const studentName = `미가입${s.id}`;
  const { studentId } = await api(page, "POST", "/api/t/students/temporary", {
    name: studentName,
    phone: s.phone,
  });
  const start30 = new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);
  await api(page, "POST", `/api/t/students/${studentId}/passes`, {
    name: "PT 10회",
    count: 10,
    startDate: start30,
    endDate: "2099-12-31",
  });
  const day = nextWeekday(4);
  const created = await api(page, "POST", "/api/t/bookings", {
    studentId,
    startAt: new Date(`${day}T19:00:00+09:00`).toISOString(),
    acknowledgeWarnings: true,
  });
  const bookingId = created.created[0] as string;

  // 알림 못 받는 수강생 목록 → 카톡으로 보내기 (확정 요청)
  await page.goto("/t/manual-notify");
  const card = page.locator("section", { hasText: `${studentName} · 미가입` });
  await expect(card).toBeVisible();
  await expect(card.getByText(NIGHT_NOTICE).first()).toBeVisible();
  const confirmItem = card
    .locator("div", { has: page.locator("p", { hasText: /^확정 요청/ }) })
    .last();
  await confirmItem.getByRole("button", { name: "카톡으로 보내기" }).click();
  const confirmLink = await confirmItem.getByTestId("share-link").textContent();
  expect(confirmLink).toMatch(/\/l\/confirm\/[\w-]+$/);

  // 수강생: 로그인 없이 링크에서 수락
  const anon = await browser.newContext();
  const sp = await anon.newPage();
  await sp.goto(new URL(confirmLink!).pathname);
  await expect(sp.getByText(`${studentName}님`)).toBeVisible();
  await sp.getByRole("button", { name: "수락" }).click();
  await expect(sp.getByText("예약을 수락했습니다")).toBeVisible();
  // 1회용: 다시 열면 사용한 링크
  await sp.goto(new URL(confirmLink!).pathname);
  await expect(sp.getByText("이미 사용한 링크입니다")).toBeVisible();

  const cal = await api(page, "GET", `/api/t/calendar?from=${day}&to=${day}`);
  expect(
    cal.bookings.find((b: { id: string }) => b.id === bookingId).status,
  ).toBe("CONFIRMED");

  // 규칙 동의 링크
  await page.goto(`/t/students/${studentId}`);
  await page
    .getByRole("button", { name: "카톡으로 규칙 동의 요청 보내기" })
    .click();
  const rulesLink = await page.getByTestId("share-link").first().textContent();
  await sp.goto(new URL(rulesLink!).pathname);
  await expect(
    sp.getByText("수업 24시간 전 이후에 취소하면 1회 차감됩니다"),
  ).toBeVisible();
  await sp.getByRole("button", { name: "동의", exact: true }).click();
  await expect(sp.getByText("수강 규칙에 동의했습니다")).toBeVisible();

  // 지난 수업 → 완료 승인 대기 → 카톡으로 승인 요청
  const past = await insertPastBooking(studentId, 120);
  await cronTick(page);
  await page.goto("/t/manual-notify");
  const card2 = page.locator("section", { hasText: `${studentName} · 미가입` });
  const approveItem = card2
    .locator("div", { has: page.locator("p", { hasText: /^완료 승인 요청/ }) })
    .last();
  await approveItem.getByRole("button", { name: "카톡으로 보내기" }).click();
  const approveLink = await approveItem.getByTestId("share-link").textContent();
  expect(approveLink).toMatch(/\/l\/approve\//);

  // 미가입 수강생: 가입 화면으로 (이름·전화번호 채워짐) → 가입 → 기록 합치기 → 승인
  await sp.goto(new URL(approveLink!).pathname);
  await sp.getByRole("link", { name: "가입하고 승인하기" }).click();
  await expect(sp.getByRole("radio", { name: "수강생" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await signupViaUi(sp, {
    role: "수강생",
    loginId: `st${s.id}`,
    phone: s.phone,
    name: studentName,
    trainerName: `카톡코치${t.id}`,
    fromCurrentPage: true,
  });
  await expect(sp).toHaveURL(/\/onboarding\/merge\?then=/);
  await sp.getByRole("button", { name: "네, 맞아요" }).click();
  await expect(sp).toHaveURL(/\/l\/approve\//);
  await sp.getByLabel("PIN").fill("1357");
  await sp.getByRole("button", { name: "승인", exact: true }).click();
  await expect(sp.getByText("수업 완료를 승인했습니다")).toBeVisible();

  const after = await api(
    page,
    "GET",
    `/api/t/calendar?from=${new Date(past.start.getTime() + 9 * 3600_000).toISOString().slice(0, 10)}&to=${day}`,
  );
  expect(
    after.bookings.find((b: { id: string }) => b.id === past.id).status,
  ).toBe("COMPLETED");
  await anon.close();
});
