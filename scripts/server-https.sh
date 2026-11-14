#!/usr/bin/env bash
# 서버에 nginx가 있을 때: pt 도메인을 앱(127.0.0.1:APP_PORT)으로 연결하고 HTTPS 인증서 발급
set -euo pipefail
DOMAIN="$1"; PORT="${2:-3100}"
sed -e "s/pt.rest-wifi.co.kr/$DOMAIN/" -e "s/127.0.0.1:3100/127.0.0.1:$PORT/" /opt/pt-app/deploy/nginx-pt.conf > /etc/nginx/sites-available/pt.conf 2>/dev/null \
  || sed -e "s/pt.rest-wifi.co.kr/$DOMAIN/" -e "s/127.0.0.1:3100/127.0.0.1:$PORT/" /opt/pt-app/deploy/nginx-pt.conf > /etc/nginx/conf.d/pt.conf
[ -d /etc/nginx/sites-enabled ] && ln -sf /etc/nginx/sites-available/pt.conf /etc/nginx/sites-enabled/pt.conf
nginx -t && systemctl reload nginx
command -v certbot >/dev/null 2>&1 || (apt-get update -y && apt-get install -y certbot python3-certbot-nginx)
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
echo "✅ https://$DOMAIN 연결 완료"
