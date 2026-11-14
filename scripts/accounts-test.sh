#!/usr/bin/env bash
# 서버 DB에 임시 테스트 계정 만들기: npm run accounts:test
# 내 컴퓨터 → ssh 터널 → 서버 DB(서버 안에서만 열린 포트)로 연결해 scripts/create-test-accounts.ts 실행
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .deploy.env ] && [ -f .env.production ] || { echo "❌ .deploy.env / .env.production 이 필요합니다" >&2; exit 1; }
# shellcheck disable=SC1091
source .deploy.env
PW="$(grep -E '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2-)"
DBP="$(grep -E '^DB_PORT=' .env.production | cut -d= -f2- || true)"
SOCK="/tmp/pt-db-tunnel-$$.sock"
LOCAL_PORT=15432

echo "▶ 서버 DB 연결 (ssh 터널)"
ssh -f -N -M -S "$SOCK" -o ExitOnForwardFailure=yes -L "${LOCAL_PORT}:127.0.0.1:${DBP:-5433}" "$DEPLOY_HOST"
trap 'ssh -S "$SOCK" -O exit "$DEPLOY_HOST" >/dev/null 2>&1 || true' EXIT

echo "▶ 계정 만들기"
DATABASE_URL="postgresql://ptapp:${PW}@127.0.0.1:${LOCAL_PORT}/ptapp?schema=public" \
  SMS_PROVIDER=console npx tsx scripts/create-test-accounts.ts
