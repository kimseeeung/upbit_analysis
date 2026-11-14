#!/usr/bin/env bash
# 내 컴퓨터에서 한 번에 배포: npm run deploy
# 1) 지금 코드를 압축해 서버로 보냄 → 2) 서버에서 빌드·교체 → 3) 상태 확인
# 서버 주소는 .deploy.env (npm run deploy:init 이 만들어 줌)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .deploy.env ] || { echo "❌ .deploy.env 가 없습니다. 먼저 npm run deploy:init 을 실행해 주세요." >&2; exit 1; }
# shellcheck disable=SC1091
source .deploy.env
: "${DEPLOY_HOST:?DEPLOY_HOST가 필요합니다}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/pt-app}"

VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  VERSION="${VERSION}-dirty-$(date +%H%M)"
  echo "⚠️  커밋하지 않은 변경도 함께 올립니다 (버전 $VERSION)"
fi
SUMMARY="$(git log -1 --pretty=%s 2>/dev/null | tr -d '"' || true)"

echo "▶ 서버($DEPLOY_HOST:$DEPLOY_DIR)로 코드 보내는 중"
# 압축해서 보내고 새 폴더로 교체 (지운 파일도 서버에서 지워짐). 서버의 .env.production은 유지
COPYFILE_DISABLE=1 tar czf - \
  --exclude ./.git --exclude ./node_modules --exclude ./.next \
  --exclude './.env*' --exclude ./.deploy.env \
  --exclude ./test-results --exclude ./playwright-report --exclude ./demo-tmp \
  . | ssh "$DEPLOY_HOST" "set -e
    mkdir -p $DEPLOY_DIR
    rm -rf $DEPLOY_DIR.new && mkdir -p $DEPLOY_DIR.new
    tar xzf - -C $DEPLOY_DIR.new
    if [ -f $DEPLOY_DIR/.env.production ]; then cp -p $DEPLOY_DIR/.env.production $DEPLOY_DIR.new/; fi
    rm -rf $DEPLOY_DIR.old && mv $DEPLOY_DIR $DEPLOY_DIR.old && mv $DEPLOY_DIR.new $DEPLOY_DIR"

# 처음 배포: 운영 설정 파일도 보냄 (서버에 이미 있으면 그대로 둠)
if [ -f .env.production ] && ! ssh "$DEPLOY_HOST" "test -f $DEPLOY_DIR/.env.production"; then
  echo "▶ 운영 설정(.env.production) 보내는 중"
  scp -q .env.production "$DEPLOY_HOST:$DEPLOY_DIR/.env.production"
  ssh "$DEPLOY_HOST" "chmod 600 $DEPLOY_DIR/.env.production"
fi

echo "▶ 서버에서 빌드·교체 (처음엔 5~10분)"
ssh "$DEPLOY_HOST" "cd $DEPLOY_DIR && APP_VERSION='$VERSION' DEPLOY_SUMMARY=\"$SUMMARY\" DEPLOYED_BY='$(whoami)' bash scripts/server-up.sh"
