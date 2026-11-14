#!/usr/bin/env bash
# 서버 DB에 연결해 내 컴퓨터의 스크립트를 실행: bash scripts/with-server-db.sh scripts/xxx.ts
# 내 컴퓨터 → ssh 터널 → 서버 DB(서버 안에서만 열린 포트)
set -euo pipefail
cd "$(dirname "$0")/.."
SCRIPT="${1:?실행할 스크립트를 주세요}"
[ -f .deploy.env ] && [ -f .env.production ] || { echo "❌ .deploy.env / .env.production 이 필요합니다" >&2; exit 1; }
# shellcheck disable=SC1091
source .deploy.env
PW="$(grep -E '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2-)"
DBP="$(grep -E '^DB_PORT=' .env.production | cut -d= -f2- || true)"
SOCK="/tmp/pt-db-tunnel-$$.sock"
LOCAL_PORT="${LOCAL_DB_PORT:-15432}"

ssh -f -N -M -S "$SOCK" -o ExitOnForwardFailure=yes -L "${LOCAL_PORT}:127.0.0.1:${DBP:-5433}" "$DEPLOY_HOST"
trap 'ssh -S "$SOCK" -O exit "$DEPLOY_HOST" >/dev/null 2>&1 || true' EXIT

DATABASE_URL="postgresql://ptapp:${PW}@127.0.0.1:${LOCAL_PORT}/ptapp?schema=public" \
  SMS_PROVIDER=console npx tsx "$SCRIPT"
