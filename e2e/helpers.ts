import { expect, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";

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
  /** 이미 열린 가입 화면에서 이어서 (쿼리 유지) */
  fromCurrentPage?: boolean;
}

export async function signupViaUi(page: Page, o: SignupOpts) {
  const password = o.password ?? "abcd123!";
  if (!o.fromCurrentPage) await page.goto("/signup");
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
  await expect(page).toHaveURL(/\/onboarding\/(notifications|merge)/);
}

/** 다음 주 같은 요일(월=1)의 한국 날짜 YYYY-MM-DD */
export function nextWeekday(weekday: number, weeksAhead = 1): string {
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const d = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
    ),
  );
  const diff =
    ((weekday - d.getUTCDay() + 7) % 7) +
    7 * weeksAhead -
    (weekday >= d.getUTCDay() ? 7 : 0);
  d.setUTCDate(d.getUTCDate() + (diff <= 0 ? diff + 7 : diff));
  return d.toISOString().slice(0, 10);
}

export async function api(
  page: Page,
  method: "GET" | "POST" | "PUT",
  url: string,
  data?: unknown,
) {
  const res = await page.request.fetch(url, {
    method,
    data,
    headers: data ? { "content-type": "application/json" } : {},
  });
  expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBe(true);
  return res.json();
}

/** 트레이너·수강생 가입, 연결, 이용권, 규칙 동의, 근무 시간 (API로 빠르게) */
export async function setupPair(trainer: Page, student: Page) {
  const t = uniq();
  const trainerName = `강코치${t.id}`;
  await signupViaUi(trainer, {
    role: "트레이너",
    loginId: `tr${t.id}`,
    phone: t.phone,
    name: trainerName,
  });
  const s = uniq();
  const studentName = `윤수강${s.id}`;
  await signupViaUi(student, {
    role: "수강생",
    loginId: `st${s.id}`,
    phone: s.phone,
    name: studentName,
    trainerName,
  });

  const inbox = await api(trainer, "GET", "/api/requests");
  await api(trainer, "POST", `/api/requests/link/${inbox.linkRequests[0].id}`, {
    accept: true,
  });
  const { students } = await api(trainer, "GET", "/api/t/students");
  const studentId = students[0].studentId as string;
  // 지난 수업도 이 이용권으로 처리되도록 30일 전부터 시작
  const kst = new Date(Date.now() + 9 * 3600_000 - 30 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  await api(trainer, "POST", `/api/t/students/${studentId}/passes`, {
    name: "PT 10회",
    count: 10,
    startDate: kst,
    endDate: "2099-12-31",
  });
  const sInbox = await api(student, "GET", "/api/requests");
  await api(
    student,
    "POST",
    `/api/s/rule-consents/${sInbox.ruleConsents[0].id}`,
    { action: "AGREE" },
  );
  await api(trainer, "PUT", "/api/t/availability", {
    rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startTime: "09:00",
      endTime: "22:00",
    })),
    exceptions: [],
  });
  return { studentName, studentId, trainerLoginId: `tr${t.id}` };
}

/** E2E DB에 직접 쓰기 (지난 수업 같은 시간 의존 상황을 만들 때만) */
export async function withE2eDb<T>(
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL_E2E });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** 지난 수업(확정 상태)을 만든다 */
export async function insertPastBooking(
  studentId: string,
  minutesAgoStart: number,
  durationMinutes = 50,
) {
  return withE2eDb(async (c) => {
    const s = await c.query(
      'SELECT "currentTrainerId" FROM "Student" WHERE id = $1',
      [studentId],
    );
    const trainerId = s.rows[0].currentTrainerId as string;
    const id = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const start = new Date(Date.now() - minutesAgoStart * 60_000);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    await c.query(
      `INSERT INTO "Booking" (id, "studentId", "trainerId", "startAt", "endAt", source, status, "createdBy", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'TRAINER', 'CONFIRMED', $3, now())`,
      [id, studentId, trainerId, start, end],
    );
    return { id, start, end };
  });
}

export const CRON_SECRET = "e2e-cron-secret";

export async function cronTick(page: Page) {
  const res = await page.request.post("/api/cron/tick", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.ok()).toBe(true);
  return res.json();
}
