#!/usr/bin/env bash
# 서버 DB에 임시 테스트 계정 만들기: npm run accounts:test
exec bash "$(dirname "$0")/with-server-db.sh" scripts/create-test-accounts.ts
