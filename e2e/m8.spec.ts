import { expect, test } from "@playwright/test";
import {
  api,
  cronTick,
  insertPastBooking,
  openMenu,
  setupPair,
  withE2eDb,
} from "./helpers";

test("수강생 탈퇴 신청 → 다시 로그인해 취소 → 다시 탈퇴 → 삭제 뒤 트레이너 화면은 '탈퇴 회원'", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName, studentId } = await setupPair(trainer, student);
  const past = await insertPastBooking(studentId, 120);
  await cronTick(trainer);
  await api(student, "POST", `/api/s/bookings/${past.id}/approve`, {
    pin: "1357",
  });
  const loginId = (await api(student, "GET", "/api/me/profile"))
    .loginId as string;

  // 탈퇴 신청
  await student.goto("/s/me");
  await openMenu(student, "회원 탈퇴");
  await student.getByRole("button", { name: "회원 탈퇴" }).last().click();
  await expect(student.getByText(/남은 이용권 1개/)).toBeVisible();
  await student.getByLabel("비밀번호", { exact: true }).fill("abcd123!");
  await student.getByRole("button", { name: "탈퇴 신청" }).click();
  await expect(
    student.getByRole("dialog", { name: "탈퇴 신청 완료" }),
  ).toContainText(
    /탈퇴 신청일로부터 5일 동안 개인정보와 기록이 유지된 뒤 삭제됩니다\. 삭제 예정일: \d+월 \d+일\. 5일 안에 다시 로그인하면 탈퇴를 취소할 수 있습니다\. 탈퇴를 취소해도 취소된 예약은 복구되지 않습니다\./,
  );

  // 다시 로그인 → 탈퇴 취소 화면
  await student.goto("/login");
  await student.getByRole("radio", { name: "수강생" }).click();
  await student.getByLabel("아이디", { exact: true }).fill(loginId);
  await student.getByLabel("비밀번호", { exact: true }).fill("abcd123!");
  await student.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(student).toHaveURL(/\/withdraw\/cancel/);
  // 정지 상태: 다른 화면은 취소 화면으로
  await student.goto("/s");
  await expect(student).toHaveURL(/\/withdraw\/cancel/);
  await student.getByRole("button", { name: "탈퇴 취소하기" }).click();
  await expect(student).toHaveURL(/\/s$/);

  // 다시 탈퇴하고 5일이 지난 것으로 만든 뒤 삭제 작업
  await api(student, "POST", "/api/me/withdraw", { password: "abcd123!" });
  await withE2eDb((c) =>
    c.query(
      `UPDATE "User" SET "deleteScheduledAt" = now() - interval '1 minute' WHERE "loginId" = $1`,
      [loginId],
    ),
  );
  const r = await cronTick(trainer);
  expect(r.usersDeleted).toBe(1);

  await trainer.goto("/t/stats");
  await trainer.getByRole("button", { name: "올해" }).click();
  await expect(
    trainer.locator("[data-stat-row]", { hasText: "탈퇴 회원" }),
  ).toBeVisible();
  await expect(trainer.getByText(studentName)).toHaveCount(0);
  for (const c of [tc, sc]) await c.close();
});
