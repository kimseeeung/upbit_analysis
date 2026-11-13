import { expect, test } from "@playwright/test";
import { api, nextWeekday, setupPair as setup } from "./helpers";

test("트레이너 등록 → 수강생 확정 → 트레이너 변경 요청 → 수강생 수락", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName, studentId } = await setup(trainer, student);
  const day = nextWeekday(1); // 다음 주 월요일
  const day2 = nextWeekday(2); // 다음 주 화요일

  // 1) 트레이너가 예약 등록 → 확정 대기
  await trainer.goto(`/t?date=${day}`);
  await trainer.getByRole("button", { name: "예약 등록" }).click();
  const sheet = trainer.getByRole("dialog", { name: "예약 등록" });
  await sheet.getByLabel("수강생").selectOption(studentId);
  await sheet.getByLabel("시작 시각").fill(`${day}T19:00`);
  await sheet
    .getByRole("button", { name: "등록하고 확정 요청 보내기" })
    .click();
  await expect(
    trainer.getByText("예약 1건을 등록하고 확정 요청을 보냈습니다"),
  ).toBeVisible();
  await expect(
    trainer.locator(".fc-event", { hasText: `${studentName} · 확정 대기` }),
  ).toBeVisible();

  // 같은 시간 중복 차단
  await trainer.getByRole("button", { name: "예약 등록" }).click();
  await sheet.getByLabel("수강생").selectOption(studentId);
  await sheet.getByLabel("시작 시각").fill(`${day}T19:30`);
  await sheet
    .getByRole("button", { name: "등록하고 확정 요청 보내기" })
    .click();
  await expect(
    sheet.getByText("이미 다른 수업이 있는 시간입니다"),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "닫기" }).click();

  // 2) 수강생이 요청함에서 수락 → 예약 확정
  await student.goto("/s/requests");
  await expect(student.getByText("예약 확정 요청")).toBeVisible();
  await student.getByRole("button", { name: "수락", exact: true }).click();
  await expect(student.getByText("처리할 요청이 없습니다")).toBeVisible();

  // 3) 트레이너: 예약을 눌러 시간 변경 요청
  await trainer.reload();
  const ev = trainer.locator(".fc-event", {
    hasText: `${studentName} · 예약 확정`,
  });
  await expect(ev).toBeVisible();
  await ev.click();
  const detail = trainer.getByRole("dialog");
  await detail.getByRole("button", { name: "시간 변경 요청" }).click();
  await detail.getByLabel("새 시간 1").fill(`${day2}T20:00`);
  await detail.getByRole("button", { name: "변경 요청 보내기" }).click();
  await expect(trainer.getByText("변경 요청을 보냈습니다")).toBeVisible();
  // 수락 전까지 원래 시간 유지
  await expect(
    trainer.locator(".fc-event", {
      hasText: new RegExp(`${studentName} · 예약 확정 · .*변경요청`),
    }),
  ).toBeVisible();

  // 4) 수강생: 캘린더에서 예약을 눌러 변경 수락
  await student.goto(`/s?date=${day}`);
  const sev = student.locator(".fc-event", { hasText: "예약 확정" });
  await sev.click();
  await student.getByRole("button", { name: /변경 수락/ }).click();
  await expect(student.getByText("변경을 수락했습니다")).toBeVisible();

  const cal = await api(
    trainer,
    "GET",
    `/api/t/calendar?from=${day}&to=${day2}`,
  );
  const b = cal.bookings.find(
    (x: { status: string }) => x.status === "CONFIRMED",
  );
  expect(new Date(b.startAt).toISOString()).toBe(
    new Date(`${day2}T20:00:00+09:00`).toISOString(),
  );
  expect(b.changeRequest).toBeNull();

  await tc.close();
  await sc.close();
});

test("수강생이 빈 시간에 신청 → 트레이너 요청함에서 수락", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName } = await setup(trainer, student);
  const day = nextWeekday(3);

  await student.goto(`/s?date=${day}`);
  await expect(student.getByText("다음 수업")).toBeVisible();
  await expect(student.getByText("10 / 10회")).toBeVisible();
  // 다음 주 수요일 10:00 칸
  const slots = student.locator(".fc-event", { hasText: "예약 가능" });
  await expect(slots.first()).toBeVisible();
  const cal = await api(
    student,
    "GET",
    `/api/s/calendar?from=${day}&to=${day}`,
  );
  const target = cal.slots.find(
    (s: { start: string }) =>
      s.start === new Date(`${day}T10:00:00+09:00`).toISOString(),
  );
  expect(target).toBeTruthy();
  await api(student, "POST", "/api/s/bookings", { startAt: target.start });

  await trainer.goto("/t/requests");
  await expect(
    trainer.getByText(new RegExp(`${studentName} · `)),
  ).toBeVisible();
  await trainer.getByRole("button", { name: "수락", exact: true }).click();
  await expect(trainer.getByText("처리할 요청이 없습니다")).toBeVisible();

  await student.reload();
  await expect(
    student.locator(".fc-event", { hasText: "예약 확정" }),
  ).toBeVisible();
  await tc.close();
  await sc.close();
});
