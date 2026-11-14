#!/usr/bin/env bash
# 처음 한 번: npm run deploy:init
# 서버 주소 저장 → 운영 설정(.env.production) 만들기(비밀값 자동 생성) → 서버 준비(Docker·스왑·포트 확인)
set -euo pipefail
cd "$(dirname "$0")/.."

ask() { local q="$1" d="${2:-}" v; read -r -p "$q${d:+ [$d]}: " v; echo "${v:-$d}"; }
ask_secret() { local q="$1" v; read -r -s -p "$q: " v; echo >&2; echo "$v"; }

echo "── 1) 서버"
HOST=$(ask "서버 접속 (사용자@주소)" "root@49.50.128.161")
DIR=$(ask "서버의 앱 폴더" "/opt/pt-app")
printf 'DEPLOY_HOST=%s\nDEPLOY_DIR=%s\n' "$HOST" "$DIR" > .deploy.env
echo "저장: .deploy.env"

if [ -f .env.production ]; then
  echo "── 2) 운영 설정: 이미 .env.production 이 있어 그대로 씁니다"
else
  echo "── 2) 운영 설정 만들기"
  DOMAIN=$(ask "앱 주소(도메인)" "pt.rest-wifi.co.kr")
  OP_ID=$(ask "운영 관리자 아이디 (영문 소문자·숫자 4~20자)" "ptadmin")
  OP_NAME=$(ask "운영 관리자 이름" "관리자")
  OP_PHONE=$(ask "운영 관리자 휴대폰 (숫자만)")
  OP_PW=$(ask_secret "운영 관리자 비밀번호 (8~20자, 영문·숫자·특수문자)")
  OP_PIN=$(ask_secret "롤백 PIN (숫자 6자리, 연속·반복 금지)")
  echo "VAPID 키 만드는 중…"
  VAPID_JSON=$(npx --yes web-push generate-vapid-keys --json)
  VPUB=$(node -e "console.log(JSON.parse(process.argv[1]).publicKey)" "$VAPID_JSON")
  VPRI=$(node -e "console.log(JSON.parse(process.argv[1]).privateKey)" "$VAPID_JSON")
  CONTACT=$(ask "웹 푸시 연락처 이메일" "")
  umask 077
  cat > .env.production <<ENV
DOMAIN=$DOMAIN
APP_BASE_URL=https://$DOMAIN
COMPOSE_PROFILES=
APP_PORT=3100
POSTGRES_PASSWORD=$(openssl rand -hex 24)
VAPID_PUBLIC_KEY=$VPUB
VAPID_PRIVATE_KEY=$VPRI
VAPID_SUBJECT=mailto:$CONTACT
SMS_PROVIDER=console
SMS_FIXED_CODE=
KAKAO_JS_KEY=
OPERATOR_INIT_LOGIN_ID=$OP_ID
OPERATOR_INIT_PASSWORD=$OP_PW
OPERATOR_INIT_ROLLBACK_PIN=$OP_PIN
OPERATOR_INIT_NAME=$OP_NAME
OPERATOR_INIT_PHONE=$OP_PHONE
ADMIN_ALLOWED_IPS=
NEXT_PUBLIC_NOTIFY_QUIET_HOURS=
DEPLOY_PROVIDER=console
CRON_SECRET=$(openssl rand -hex 16)
ENV
  echo "저장: .env.production (이 컴퓨터에만 있고 커밋되지 않습니다)"
fi

echo "── 3) 서버 준비 (Docker·스왑·포트 확인)"
ssh "$HOST" 'bash -s' < scripts/server-setup.sh | tee /tmp/pt-server-setup.log
WEB=$(grep -E '^WEB=' /tmp/pt-server-setup.log | cut -d= -f2 || true)

echo
echo "── 다음 할 일"
case "$WEB" in
  nginx) echo "서버에 nginx가 있습니다. 배포 뒤 npm run deploy:https 로 $DOMAIN HTTPS를 연결하세요." ;;
  none)  sed -i.bak 's/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=https/' .env.production && rm -f .env.production.bak
         echo "80/443이 비어 있어 HTTPS를 자동 발급하도록 설정했습니다(Caddy)." ;;
  *)     echo "80/443 포트를 다른 프로그램이 쓰고 있습니다(위 목록 참고). 알려 주시면 연결 방법을 맞춰 드립니다."
         echo "일단 http://서버IP:3100 으로 열려면 네이버 클라우드 ACG에서 3100 포트를 열고 .env.production의 APP_PORT 앞 127.0.0.1 제한을 풀어야 합니다." ;;
esac
echo "도메인 DNS: ${DOMAIN:-pt 도메인} → 서버 IP (A 레코드)"
echo "네이버 클라우드 콘솔 → Server → ACG: 80, 443 포트 허용 확인"
echo "그다음: npm run deploy"
