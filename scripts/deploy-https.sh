#!/usr/bin/env bash
# npm run deploy:https — 서버 nginx에 pt 도메인 연결 + HTTPS 인증서
set -euo pipefail
cd "$(dirname "$0")/.."
source .deploy.env
DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d= -f2)
PORT=$(grep -E '^APP_PORT=' .env.production | cut -d= -f2)
ssh "$DEPLOY_HOST" "bash $DEPLOY_DIR/scripts/server-https.sh $DOMAIN ${PORT:-3100}"
