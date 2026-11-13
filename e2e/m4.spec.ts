import { expect, test } from "@playwright/test";
import { api, cronTick, insertPastBooking, setupPair } from "./helpers";

const kstDate = (d: Date) =>
  new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

test("수업 종료 → 현장 PIN 승인 / 앱 PIN 승인 / 노쇼 이의 제기", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName, studentId } = await setupPair(trainer, student);

  // 지난 수업 3개 (모두 종료됨, 종료 후 24시간 안)
  const a = await insertPastBooking(studentId, 240);
  const b = await insertPastBooking(studentId, 170);
  const c = await insertPastBooking(studentId, 100);
  const r = await cronTick(trainer);
  expect(r.approvalStarted).toBe(3);
  const from = kstDate(a.start);
  const to = kstDate(c.start);

  // 1) 현장 승인: 트레이너 기기에서 수강생이 PIN 입력
  await trainer.goto(`/t?date=${kstDate(a.start)}`);
  await trainer.getByRole("button", { name: "일", exact: true }).click();
  const evA = trainer.locator(`.booking-${a.id}`);
  await expect(evA).toContainText(`${studentName} · 완료 승인 대기`);
  await evA.click();
  await trainer.getByRole("button", { name: "현장 완료 승인 (PIN)" }).click();
  const pinScreen = trainer.getByRole("dialog", { name: "현장 완료 승인" });
  await pinScreen.getByLabel("PIN").fill("0000");
  await pinScreen.getByRole("button", { name: "승인" }).click();
  await expect(
    pinScreen.getByText("PIN이 맞지 않습니다 (남은 횟수 4회)"),
  ).toBeVisible();
  await pinScreen.getByLabel("PIN").fill("1357");
  await pinScreen.getByRole("button", { name: "승인" }).click();
  await expect(
    trainer.getByText("수업 완료를 승인했습니다 (1회 차감)"),
  ).toBeVisible();

  // 2) 앱 승인: 수강생 요청함에서 PIN
  await student.goto("/s/requests");
  await expect(student.getByText("수업 완료 승인")).toHaveCount(2);
  await student.getByLabel("PIN").first().fill("1357");
  await student
    .getByRole("button", { name: "승인", exact: true })
    .first()
    .click();
  await expect(student.getByText("수업 완료 승인")).toHaveCount(1);

  // 3) 남은 하나는 트레이너가 노쇼로 변경 → 수강생 이의 제기 → 트레이너 수락
  const cal1 = await api(
    trainer,
    "GET",
    `/api/t/calendar?from=${from}&to=${to}`,
  );
  const pending = cal1.bookings.find(
    (x: { status: string }) => x.status === "PENDING_APPROVAL",
  ) as { id: string; startAt: string };
  const pendingDate = kstDate(new Date(pending.startAt));
  await trainer.goto(`/t?date=${pendingDate}`);
  await trainer.getByRole("button", { name: "일", exact: true }).click();
  await trainer.locator(`.booking-${pending.id}`).click();
  await trainer
    .getByRole("button", { name: "노쇼로 변경 (종료 후 24시간 안)" })
    .click();
  await expect(trainer.getByText("노쇼로 바꿨습니다")).toBeVisible();

  const passes = await api(student, "GET", "/api/s/passes");
  expect(passes.passes[0].remaining).toBe(10 - 3);

  await student.goto(`/s?date=${pendingDate}`);
  await student.locator(`.booking-${pending.id}`).first().click();
  await expect(
    student.getByText(
      "적용 규칙: 수업 시작 후 15분까지 오지 않으면 노쇼로 1회 차감됩니다",
    ),
  ).toBeVisible();
  await student.getByRole("button", { name: "이의 제기" }).click();
  await student.getByLabel("이의 사유").fill("미리 연락드렸어요");
  await student.getByRole("button", { name: "이의 제기 보내기" }).click();
  await expect(student.getByText("이의를 제기했습니다")).toBeVisible();

  await trainer.goto("/t/requests");
  await expect(trainer.getByText("사유: 미리 연락드렸어요")).toBeVisible();
  await trainer.getByRole("button", { name: "수강생 의견 수락" }).click();
  await expect(trainer.getByText("처리할 요청이 없습니다")).toBeVisible();

  const after = await api(student, "GET", "/api/s/passes");
  expect(after.passes[0].remaining).toBe(10 - 2);

  const cal = await api(
    trainer,
    "GET",
    `/api/t/calendar?from=${from}&to=${to}`,
  );
  const byId = Object.fromEntries(
    cal.bookings.map((x: { id: string; status: string }) => [x.id, x.status]),
  );
  expect([a, b, c].map((x) => byId[x.id]).sort()).toEqual([
    "CANCELED",
    "COMPLETED",
    "COMPLETED",
  ]);
  await tc.close();
  await sc.close();
});
