#!/usr/bin/env bash
# 서버 공간 정리 (배포 전에 deploy.sh가 ssh로 실행). 기존 서비스(/opt/upbit-bot 등)는 건드리지 않는다.
set -uo pipefail
DIR="${1:-/opt/pt-app}"
avail_mb() { df -Pm / | awk 'NR==2{print $4}'; }
echo "   정리 전 남은 공간: $(avail_mb)MB"

# 1) 예전 서버 빌드가 남긴 Docker 캐시·쓰지 않는 이미지 (머슬매니아용만 쓰므로 안전)
if command -v docker >/dev/null 2>&1; then
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}' | grep -q '^pt-app-app$' && docker rmi -f pt-app-app >/dev/null 2>&1 || true
fi
# 2) 예전 방식에서 남은 소스·임시 폴더
rm -rf "$DIR.old" "$DIR.new" "$DIR/.incoming" "$DIR/release.old" \
  "$DIR/src" "$DIR/node_modules" "$DIR/.next" "$DIR/e2e" "$DIR/docs" "$DIR/prisma" \
  "$DIR/public" "$DIR/Dockerfile" "$DIR/package.json" "$DIR/package-lock.json" 2>/dev/null || true
# 3) 패키지 캐시·오래된 시스템 기록
apt-get clean >/dev/null 2>&1 || true
journalctl --vacuum-size=50M >/dev/null 2>&1 || true
# 4) 공간이 모자라면 스왑을 1GB로 줄임 (스왑 사용량이 적을 때만)
if [ -f /swapfile ] && [ "$(avail_mb)" -lt 1500 ]; then
  SIZE_MB=$(( $(stat -c %s /swapfile) / 1048576 ))
  USED_MB=$(free -m | awk '/Swap:/{print $3}')
  if [ "$SIZE_MB" -gt 1100 ] && [ "$USED_MB" -lt 300 ]; then
    swapoff /swapfile && rm -f /swapfile \
      && fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile \
      && echo "   스왑 ${SIZE_MB}MB → 1024MB"
  fi
fi
A=$(avail_mb)
echo "   정리 후 남은 공간: ${A}MB"
if [ "$A" -lt 700 ]; then
  echo "❌ 서버 공간이 부족합니다 (최소 700MB 필요). 큰 폴더:" >&2
  du -xh --max-depth=2 / 2>/dev/null | sort -rh | head -15 >&2
  exit 1
fi
