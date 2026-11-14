import { expect, test } from "@playwright/test";
import { api, nextWeekday, pickDateTime, setupPair } from "./helpers";

test("오프라인: 백업으로 조회 · 임시 저장 → 복구 후 반영", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName, studentId, trainerLoginId } = await setupPair(
    trainer,
    student,
  );
  // 휴대폰 백업은 자동 로그인 기기에서만 (11.2)
  const login = await trainer.request.post("/api/auth/login", {
    data: {
      role: "TRAINER",
      loginId: trainerLoginId,
      password: "abcd123!",
      remember: true,
    },
  });
  expect(login.ok()).toBe(true);

  const day = nextWeekday(4);
  await api(trainer, "POST", "/api/t/bookings", {
    studentId,
    startAt: new Date(`${day}T10:00:00+09:00`).toISOString(),
    acknowledgeWarnings: true,
  });

  // 서비스 워커가 화면을 넘겨받을 때까지 기다린 뒤 다시 열어 백업
  await trainer.goto(`/t?date=${day}`);
  await trainer.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", r, {
          once: true,
        }),
      );
  });
  await trainer.reload();
  await expect(
    trainer.locator(".fc-event", { hasText: `${studentName} · 확정 대기` }),
  ).toBeVisible();
  await trainer.goto("/t/me");
  await expect(trainer.getByText(/마지막 백업: \d/)).toBeVisible({
    timeout: 15_000,
  });

  // 네트워크 끊김 → 다시 열어도 백업으로 보인다
  await tc.setOffline(true);
  await trainer.goto(`/t?date=${day}`);
  await expect(trainer.getByText(/오프라인 · 마지막 동기화/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    trainer.locator(".fc-event", { hasText: `${studentName} · 확정 대기` }),
  ).toBeVisible();

  // 오프라인에서 예약 등록 → 휴대폰에 임시 저장
  await trainer.getByRole("button", { name: "예약 등록" }).click();
  const sheet = trainer.getByRole("dialog", { name: "예약 등록" });
  await sheet.getByLabel("수강생").selectOption(studentId);
  await pickDateTime(sheet, "시작 시각", `${day}T15:00`);
  await sheet
    .getByRole("button", { name: "등록하고 확정 요청 보내기" })
    .click();
  await expect(trainer.getByText(/임시 저장했습니다/)).toBeVisible();
  await expect(trainer.getByText(/동기화 대기 1건/)).toBeVisible();
  await expect(
    trainer.locator(".fc-event", { hasText: "동기화 대기" }),
  ).toBeVisible();

  // 연결 복구 → 자동 동기화
  await tc.setOffline(false);
  await expect(trainer.getByText(/동기화 완료 · 반영 1건/)).toBeVisible({
    timeout: 30_000,
  });
  const cal = await api(
    trainer,
    "GET",
    `/api/t/calendar?from=${day}&to=${day}`,
  );
  const starts = cal.bookings.map((b: { startAt: string }) =>
    new Date(b.startAt).toISOString(),
  );
  expect(starts).toContain(new Date(`${day}T15:00:00+09:00`).toISOString());
  expect(starts).toHaveLength(2);

  await tc.close();
  await sc.close();
});
