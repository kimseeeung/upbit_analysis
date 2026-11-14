#!/usr/bin/env bash
# 배포 묶음 만들기 (내 컴퓨터에서): release/ 폴더에 서버에서 바로 실행할 파일만 모은다.
# 서버는 빌드하지 않고 이 묶음을 그대로 실행한다 (서버 메모리·디스크 절약).
set -euo pipefail
cd "$(dirname "$0")/.."

# 빌드 때 화면에 들어가는 공개 설정(NEXT_PUBLIC_*)은 .env.production 에서 읽는다
if [ -f .env.production ]; then
  NEXT_PUBLIC_NOTIFY_QUIET_HOURS="$(grep -E '^NEXT_PUBLIC_NOTIFY_QUIET_HOURS=' .env.production | cut -d= -f2- || true)"
  export NEXT_PUBLIC_NOTIFY_QUIET_HOURS
fi

echo "▶ 빌드 (1~3분)"
rm -rf .next release
NODE_ENV=production NEXT_OUTPUT=standalone npx next build >/tmp/pt-release-build.log 2>&1 || {
  tail -40 /tmp/pt-release-build.log
  echo "❌ 빌드 실패" >&2
  exit 1
}

echo "▶ 묶음 만들기"
mkdir -p release/.next
cp -R .next/standalone/. release/
cp -R .next/static release/.next/static
cp -R public release/public
cp -R prisma/migrations release/migrations
cp scripts/migrate.mjs release/migrate.mjs
# Next.js가 standalone에 복사하는 내 컴퓨터 설정 파일(.env*)은 빼고 보낸다 (운영 값은 서버의 .env.production)
rm -f release/.env release/.env.*
du -sh release | awk '{print "묶음 크기: "$1}'
