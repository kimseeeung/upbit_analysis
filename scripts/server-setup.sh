#!/usr/bin/env bash
# 서버 준비 (처음 한 번, deploy-init 이 ssh로 실행): Docker 설치, 메모리 부족 대비 스왑, 포트·웹 서버 확인
# 기존 서비스(/opt/upbit-bot 등)는 건드리지 않는다.
set -euo pipefail
APP_PORT="${APP_PORT:-3100}"

echo "── 서버 정보"
. /etc/os-release && echo "OS: $PRETTY_NAME"
free -m | awk '/Mem:/{print "메모리: "$2"MB"} /Swap:/{print "스왑: "$2"MB"}'
df -h / | awk 'NR==2{print "디스크 남은 공간: "$4}'

echo "── Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker 설치 중…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker --version
docker compose version

echo "── 스왑 (빌드할 때 메모리 부족 방지)"
MEM=$(free -m | awk '/Mem:/{print $2}')
SWAP=$(free -m | awk '/Swap:/{print $2}')
if [ "$MEM" -lt 4000 ] && [ "$SWAP" -lt 1000 ]; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  swapon /swapfile 2>/dev/null || true
  echo "스왑 1GB 켬"
else
  echo "충분함"
fi

echo "── 포트 확인"
if ss -ltn "( sport = :$APP_PORT )" | grep -q LISTEN; then
  echo "⚠️  $APP_PORT 포트를 이미 쓰는 프로그램이 있습니다. .env.production의 APP_PORT를 바꿔 주세요"
else
  echo "앱 포트 $APP_PORT 사용 가능"
fi
echo "80/443 포트를 쓰는 프로그램:"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:80 |:443 /' || true
if command -v nginx >/dev/null 2>&1; then
  echo "WEB=nginx"
elif ss -ltn 2>/dev/null | grep -qE ':(80|443) '; then
  echo "WEB=other"
else
  echo "WEB=none"
fi
