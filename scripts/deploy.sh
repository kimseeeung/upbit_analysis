#!/usr/bin/env bash
# 내 컴퓨터에서 한 번에 배포: npm run deploy
# 1) 내 컴퓨터에서 배포 묶음 빌드 → 2) 서버로 보냄 → 3) 서버에서 교체·DB 마이그레이션 → 4) 상태 확인
# 서버는 빌드하지 않는다 (작은 서버의 메모리·디스크 절약). 서버 주소는 .deploy.env (npm run deploy:init)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .deploy.env ] || { echo "❌ .deploy.env 가 없습니다. 먼저 npm run deploy:init 을 실행해 주세요." >&2; exit 1; }
# shellcheck disable=SC1091
source .deploy.env
: "${DEPLOY_HOST:?DEPLOY_HOST가 필요합니다}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/pt-app}"

VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  VERSION="${VERSION}-local-$(date +%H%M)"
fi
SUMMARY="$(git log -1 --pretty=%s 2>/dev/null | tr -d '"$`' || true)"

bash scripts/build-release.sh

echo "▶ 서버 공간 정리"
ssh "$DEPLOY_HOST" "bash -s -- $DEPLOY_DIR" < scripts/server-clean.sh

echo "▶ 서버($DEPLOY_HOST:$DEPLOY_DIR)로 보내는 중"
TAR_FLAGS=""
if tar --version 2>/dev/null | grep -qi bsdtar; then TAR_FLAGS="--no-xattrs --no-mac-metadata"; fi
# shellcheck disable=SC2086
COPYFILE_DISABLE=1 tar czf - $TAR_FLAGS release docker-compose.yml deploy scripts/server-up.sh scripts/server-https.sh \
  | ssh "$DEPLOY_HOST" "set -e
    mkdir -p $DEPLOY_DIR && cd $DEPLOY_DIR
    rm -rf .incoming && mkdir .incoming
    tar xzf - -C .incoming --warning=no-unknown-keyword
    rm -rf release.old && if [ -d release ]; then mv release release.old; fi
    mv .incoming/release release
    rm -rf deploy scripts && mv .incoming/deploy deploy && mv .incoming/scripts scripts
    mv -f .incoming/docker-compose.yml docker-compose.yml
    rm -rf .incoming
    true"

# 처음 배포: 운영 설정 파일도 보냄 (서버에 이미 있으면 그대로 둠)
if [ -f .env.production ] && ! ssh "$DEPLOY_HOST" "test -f $DEPLOY_DIR/.env.production"; then
  echo "▶ 운영 설정(.env.production) 보내는 중"
  scp -q .env.production "$DEPLOY_HOST:$DEPLOY_DIR/.env.production"
  ssh "$DEPLOY_HOST" "chmod 600 $DEPLOY_DIR/.env.production"
fi

echo "▶ 서버에서 교체·시작"
ssh "$DEPLOY_HOST" "cd $DEPLOY_DIR && APP_VERSION='$VERSION' DEPLOY_SUMMARY=\"$SUMMARY\" DEPLOYED_BY='$(whoami)' bash scripts/server-up.sh"
