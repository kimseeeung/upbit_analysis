#!/usr/bin/env bash
# 서버에서 실행: 지금 코드로 이미지를 다시 만들고 무중단에 가깝게 교체한 뒤 상태를 확인한다.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "❌ .env.production 이 없습니다. .env.production.example 을 복사해 값을 채워 주세요." >&2
  exit 1
fi

export APP_VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
export DEPLOY_SUMMARY="$(git log -1 --pretty=%s 2>/dev/null || echo '')"
export DEPLOYED_BY="${DEPLOYED_BY:-$(whoami)}"

echo "▶ 버전 $APP_VERSION 빌드·시작"
docker compose --env-file .env.production up -d --build --remove-orphans

echo "▶ 상태 확인"
PORT="$(grep -E '^APP_PORT=' .env.production | cut -d= -f2)"
PORT="${PORT:-3100}"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "✅ 배포 완료: 버전 $APP_VERSION"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done
echo "❌ 앱이 응답하지 않습니다. 기록을 확인해 주세요: docker compose --env-file .env.production logs app --tail 100" >&2
exit 1
