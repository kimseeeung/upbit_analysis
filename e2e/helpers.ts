import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** 실행마다 겹치지 않는 아이디·전화번호 */
export function uniq() {
  const n =
    `${Date.now() % 1_000_000_000}${Math.floor(Math.random() * 90 + 10)}`.slice(
      -8,
    );
  return { id: n, phone: `010${n}` };
}

export async function lastSmsCode(
  request: APIRequestContext,
  phone: string,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(`/api/dev/sms-outbox?phone=${phone}`);
    const { messages } = (await res.json()) as { messages: { text: string }[] };
    const m = /\[(\d{6})\]/.exec(messages.at(-1)?.text ?? "");
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("인증번호 문자를 찾지 못했습니다");
}

export async function verifyPhone(page: Page, phone: string) {
  await page.getByLabel("휴대폰 번호").fill(phone);
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  await expect(page.getByLabel("인증번호")).toBeVisible();
  const code = await lastSmsCode(page.request, phone);
  await page.getByLabel("인증번호").fill(code);
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByText("인증 완료")).toBeVisible();
}

export interface SignupOpts {
  role: "트레이너" | "수강생" | "센터 관리자";
  loginId: string;
  phone: string;
  name: string;
  password?: string;
  trainerName?: string;
}

export async function signupViaUi(page: Page, o: SignupOpts) {
  const password = o.password ?? "abcd123!";
  await page.goto("/signup");
  await page.getByRole("radio", { name: o.role }).click();
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByLabel("아이디", { exact: true }).fill(o.loginId);
  await page.getByRole("button", { name: "중복 확인" }).click();
  await expect(page.getByText("사용할 수 있는 아이디입니다")).toBeVisible();
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByLabel("비밀번호 확인").fill(password);
  await page.getByLabel("이름", { exact: true }).fill(o.name);

  if (o.role === "트레이너") {
    await page
      .getByRole("button", { name: "찾는 센터가 없어요 (직접 입력)" })
      .click();
    await page.getByLabel("센터명", { exact: true }).fill("테스트 PT");
    await page.getByLabel("주소", { exact: true }).fill("서울시 강남구");
  }
  if (o.role === "수강생") {
    await page.getByLabel("트레이너 이름").fill(o.trainerName!);
    await page
      .getByRole("button", { name: new RegExp(o.trainerName!) })
      .first()
      .click();
  }
  if (o.role === "센터 관리자") {
    await page.getByLabel("센터명", { exact: true }).fill(`센터 ${o.loginId}`);
    await page.getByLabel("주소", { exact: true }).fill("서울시 송파구");
    await page.getByLabel("대표 전화").fill("02-123-4567");
  }
  await page.getByRole("button", { name: "다음" }).click();

  await verifyPhone(page, o.phone);
  await page.getByRole("button", { name: "다음" }).click();

  if (o.role === "수강생") {
    await page.getByLabel("PIN (숫자 4자리)").fill("1234");
    await expect(
      page.getByText("1234, 4321처럼 연속된 PIN은 쓸 수 없습니다"),
    ).toBeVisible();
    await page.getByLabel("PIN (숫자 4자리)").fill("1357");
    await page.getByLabel("PIN 확인").fill("1357");
    await page.getByRole("button", { name: "다음" }).click();
  }

  await expect(page.getByText("서비스 이용약관 (필수)")).toBeVisible();
  await expect(page.getByRole("button", { name: "가입하기" })).toBeDisabled();
  await page.getByLabel("전체 동의").check();
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page).toHaveURL(/\/onboarding\/notifications/);
}
