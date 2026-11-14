// 운영 서버용 DB 마이그레이션 (Prisma CLI 없이). prisma/migrations 의 SQL을 이름 순서대로 한 번씩 적용하고
// Prisma와 같은 _prisma_migrations 표에 기록한다(나중에 prisma migrate deploy 를 써도 이어서 동작).
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const dir = process.env.MIGRATIONS_DIR ?? join(process.cwd(), "migrations");

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("SELECT pg_advisory_lock(hashtext('pt-app:migrate'))");
  await db.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    finished_at TIMESTAMPTZ,
    migration_name VARCHAR(255) NOT NULL,
    logs TEXT,
    rolled_back_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  )`);
  const done = new Set(
    (
      await db.query(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      )
    ).rows.map((r) => r.migration_name),
  );
  const names = readdirSync(dir, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && existsSync(join(dir, d.name, "migration.sql")),
    )
    .map((d) => d.name)
    .sort();
  let applied = 0;
  for (const name of names) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)`,
        [randomUUID(), checksum, name],
      );
      await db.query("COMMIT");
      applied++;
      console.info(`[migrate] ${name}`);
    } catch (e) {
      await db.query("ROLLBACK");
      console.error(`[migrate] 실패: ${name}`);
      throw e;
    }
  }
  console.info(
    `[migrate] 완료 (새로 적용 ${applied}개, 전체 ${names.length}개)`,
  );
} finally {
  await db.end();
}
