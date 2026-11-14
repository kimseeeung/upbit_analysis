#!/usr/bin/env bash
# 내 컴퓨터에서 한 번에 배포: npm run deploy
# 1) 커밋 안 한 변경 확인 → 2) GitHub에 올림 → 3) 서버에서 받아서 빌드·교체 → 4) 상태 확인
# 설정은 .deploy.env (커밋 안 함):
#   DEPLOY_HOST=ubuntu@서버주소      (ssh로 접속하는 주소)
#   DEPLOY_DIR=~/pt-app              (서버의 앱 폴더)
#   DEPLOY_BRANCH=main               (배포할 브랜치, 비우면 지금 브랜치)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .deploy.env ]; then
  echo "❌ .deploy.env 가 없습니다. 예시:" >&2
  echo "   DEPLOY_HOST=ubuntu@서버주소" >&2
  echo "   DEPLOY_DIR=~/pt-app" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .deploy.env
: "${DEPLOY_HOST:?DEPLOY_HOST를 .deploy.env에 넣어 주세요}"
DEPLOY_DIR="${DEPLOY_DIR:-~/pt-app}"
BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ 커밋하지 않은 변경이 있습니다. 커밋한 뒤 다시 실행해 주세요." >&2
  exit 1
fi

echo "▶ GitHub에 올리는 중 ($BRANCH)"
git push origin "HEAD:${BRANCH}"

echo "▶ 서버($DEPLOY_HOST)에서 받아서 배포"
ssh "$DEPLOY_HOST" "set -e; cd $DEPLOY_DIR && git fetch origin $BRANCH && git checkout -B $BRANCH origin/$BRANCH && DEPLOYED_BY=$(whoami) bash scripts/server-up.sh"
