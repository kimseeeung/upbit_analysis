import { expect, test } from "@playwright/test";
import {
  api,
  cronTick,
  insertPastBooking,
  pickDate,
  setupPair,
} from "./helpers";

function kstPlus(days: number) {
  return new Date(Date.now() + 9 * 3600_000 + days * 86400_000)
    .toISOString()
    .slice(0, 10);
}

test("수강생 일시정지 신청 → 트레이너 승인 → 만료일 연장·캘린더 빗금 → 조기 재개", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName } = await setupPair(trainer, student);

  const start = kstPlus(3);
  const end = kstPlus(7); // 5일
  await student.goto("/s/passes");
  await student.getByRole("button", { name: "일시정지 신청" }).click();
  await pickDate(student, "정지 시작일", start);
  await pickDate(student, "정지 종료일", end);
  await student.getByLabel("사유").fill("여행");
  await student.getByRole("button", { name: "일시정지 신청" }).click();
  await expect(student.getByText("일시정지를 요청했습니다")).toBeVisible();
  await expect(student.getByText(/승인 대기 · 여행/)).toBeVisible();

  await trainer.goto("/t/requests");
  await expect(
    trainer.getByText(`${studentName} · PT 10회 · ${start}~${end}`),
  ).toBeVisible();
  await trainer.getByRole("button", { name: "승인", exact: true }).click();
  await expect(trainer.getByText("처리할 요청이 없습니다")).toBeVisible();

  // 만료일 2099-12-31 + 5일
  const p = await api(student, "GET", "/api/s/passes");
  expect(p.passes[0].endDate).toBe("2100-01-05");

  await trainer.goto(`/t?date=${start}`);
  await expect(trainer.locator(".pt-paused").first()).toBeVisible();

  await student.goto("/s/passes");
  await student.getByRole("button", { name: "정지 취소" }).click();
  await expect(student.getByText("실제로 쉰 일수만 연장됩니다")).toBeVisible();
  const p2 = await api(student, "GET", "/api/s/passes");
  expect(p2.passes[0].endDate).toBe("2099-12-31");
  await tc.close();
  await sc.close();
});

test("수강 현황: 기간 표, 상세, 엑셀 다운로드", async ({ browser }) => {
  test.setTimeout(120_000);
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

  await trainer.goto("/t/stats");
  await trainer.getByRole("button", { name: "올해" }).click();
  const row = trainer.locator("[data-stat-row]", {
    hasText: studentName,
  });
  await expect(row).toBeVisible();
  // 전체 10, 수강 1, 노쇼 0, 취소 0, 승인 대기 0, 잔여 9
  await expect(row.locator("[data-col]")).toHaveText([
    new RegExp(studentName),
    "10",
    "1",
    "0",
    "0",
    "0",
    "9",
    "2099-12-31",
  ]);
  await expect(trainer.getByText("총 수업 수").locator("..")).toContainText(
    "1회",
  );

  const [download] = await Promise.all([
    trainer.waitForEvent("download"),
    trainer.getByRole("link", { name: "엑셀 다운로드" }).click(),
  ]);
  const path = await download.path();
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile(path!, "utf8");
  expect(csv.startsWith("﻿수강생,전체 PT 횟수")).toBe(true);
  expect(csv).toContain(`${studentName},10,1,0,0,0,0,9,2099-12-31`);

  await row.getByRole("link", { name: studentName }).click();
  await expect(trainer.getByText(/완료/).first()).toBeVisible();
  await expect(trainer.getByText(/앱 PIN/)).toBeVisible();
  await tc.close();
  await sc.close();
});
