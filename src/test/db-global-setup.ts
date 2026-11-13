import { execSync } from "node:child_process";
import "dotenv/config";

/** 테스트 DB에 마이그레이션을 적용한다 */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST가 없습니다 (.env.example 참고). 운영 DB를 쓰지 않도록 따로 지정합니다",
    );
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
