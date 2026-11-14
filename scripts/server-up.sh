#!/usr/bin/env bash
# 서버에서 실행: 보내 온 묶음(release/)으로 앱을 다시 시작하고 상태를 확인한다. (서버에서는 빌드하지 않음)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "❌ .env.production 이 없습니다. .env.production.example 을 참고해 만들어 주세요." >&2
  exit 1
fi
[ -f release/server.js ] || { echo "❌ release/ 묶음이 없습니다. 내 컴퓨터에서 npm run deploy 로 보내 주세요." >&2; exit 1; }

export APP_VERSION="${APP_VERSION:-$(date +%Y%m%d%H%M)}"
export DEPLOY_SUMMARY="${DEPLOY_SUMMARY:-}"
export DEPLOYED_BY="${DEPLOYED_BY:-$(whoami)}"

# 예전 서버 빌드에서 남은 캐시 정리 (디스크 확보)
docker builder prune -af >/dev/null 2>&1 || true

echo "▶ 버전 $APP_VERSION 시작"
docker compose --env-file .env.production up -d --force-recreate --remove-orphans app
docker compose --env-file .env.production up -d --remove-orphans

echo "▶ 상태 확인"
PORT="$(grep -E '^APP_PORT=' .env.production | cut -d= -f2)"
PORT="${PORT:-3100}"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "✅ 배포 완료: 버전 $APP_VERSION"
    docker image prune -f >/dev/null 2>&1 || true
    rm -rf release.old
    df -h / | awk 'NR==2{print "   서버 디스크 남은 공간: "$4}'
    exit 0
  fi
  sleep 3
done
echo "❌ 앱이 응답하지 않습니다. 마지막 기록:" >&2
docker compose --env-file .env.production logs app --tail 40 >&2
exit 1
