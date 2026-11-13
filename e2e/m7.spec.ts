import { expect, test } from "@playwright/test";
import { api, setupPair, signupViaUi, uniq } from "./helpers";

test("센터 초대 코드로 소속 → 센터 화면 → 센터 담당 변경 → 새 트레이너 수락 → 수강생 동의", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ac = await browser.newContext();
  const admin = await ac.newPage();
  const a = uniq();
  await signupViaUi(admin, {
    role: "센터 관리자",
    loginId: `ca${a.id}`,
    phone: a.phone,
    name: `센터장${a.id}`,
  });

  // 트레이너 1 + 수강생 (이용권·근무 시간까지)
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const trainer = await tc.newPage();
  const student = await sc.newPage();
  const { studentName, studentId } = await setupPair(trainer, student);

  // 센터: 초대 코드 → 트레이너가 내 정보에서 입력하고 동의
  await admin.goto("/c/trainers");
  await admin
    .getByRole("button", { name: "트레이너 초대 코드 만들기" })
    .click();
  const code = (await admin.getByTestId("invite-code").textContent())!.trim();
  await trainer.goto("/t/me");
  await trainer.getByRole("button", { name: "초대 코드 입력" }).click();
  await trainer.getByLabel("초대 코드").fill(code);
  await trainer
    .getByLabel("일정·수강생·이용권·결제 기록을 센터가 볼 수 있음에 동의합니다")
    .check();
  await trainer.getByRole("button", { name: "소속하기" }).click();
  await expect(trainer.getByText("센터에 소속되었습니다")).toBeVisible();

  // 트레이너 2도 소속
  const t2c = await browser.newContext();
  const trainer2 = await t2c.newPage();
  const t2 = uniq();
  const t2Name = `둘째코치${t2.id}`;
  await signupViaUi(trainer2, {
    role: "트레이너",
    loginId: `tr${t2.id}`,
    phone: t2.phone,
    name: t2Name,
  });
  const inv = await api(admin, "POST", "/api/c/invites", { kind: "TRAINER" });
  await api(trainer2, "POST", "/api/t/center/join", {
    code: inv.code,
    consent: true,
  });

  // 센터 화면: 소속 트레이너만, 수강생은 담당 표시
  await admin.goto("/c/trainers");
  await expect(admin.getByText("소속 트레이너 (2명)")).toBeVisible();
  await admin.goto("/c");
  await expect(
    admin.getByRole("group", { name: "트레이너 필터" }).getByRole("button"),
  ).toHaveCount(2);
  await admin.goto("/c/students");
  const card = admin.locator("section", { hasText: studentName });
  await expect(card).toContainText("담당:");
  await card
    .getByLabel(`${studentName} 새 담당 트레이너`)
    .selectOption({ label: t2Name });
  await card.getByRole("button", { name: "담당 변경" }).click();
  await expect(admin.getByText("담당 변경을 요청했습니다")).toBeVisible();

  // 새 트레이너 수락 → 수강생 동의
  await trainer2.goto("/t/requests");
  await trainer2.getByRole("button", { name: "내용 보고 수락하기" }).click();
  await trainer2.getByRole("button", { name: "수락", exact: true }).click();
  await expect(trainer2.getByText("처리할 요청이 없습니다")).toBeVisible();
  await student.goto("/s/requests");
  await expect(student.getByText("담당 트레이너 변경 동의")).toBeVisible();
  await student.getByRole("button", { name: "동의", exact: true }).click();
  // 새 트레이너 규칙으로 다시 동의 요청 (7.2)
  await expect(student.getByText("수강 규칙 동의 · PT 10회")).toBeVisible();

  // 완료: 새 트레이너 목록에 수강생, 이용권 그대로(같은 센터 → 센터 관리자 승인)
  const list = await api(trainer2, "GET", "/api/t/students");
  expect(
    list.students.map((s: { studentId: string }) => s.studentId),
  ).toContain(studentId);
  const passes = await api(student, "GET", "/api/s/passes");
  expect(passes.passes[0].status).toBe("ACTIVE");
  // 이전 트레이너는 더 이상 이 수강생을 볼 수 없다
  const res = await trainer.request.get(`/api/t/students/${studentId}`);
  expect(res.status()).toBe(404);

  for (const c of [ac, tc, sc, t2c]) await c.close();
});
