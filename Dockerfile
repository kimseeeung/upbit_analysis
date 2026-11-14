# 머슬매니아 운영 이미지
# 빌드: docker compose build  /  실행: docker compose up -d (scripts/server-up.sh가 대신 해 줌)
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 야간 발송 제한은 빌드 때 화면에 들어가므로 빌드 인자로 받는다 (비우면 제한 없음)
ARG NEXT_PUBLIC_NOTIFY_QUIET_HOURS=
ENV NEXT_PUBLIC_NOTIFY_QUIET_HOURS=$NEXT_PUBLIC_NOTIFY_QUIET_HOURS
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 시작할 때마다: DB 마이그레이션(이전 버전과 호환) → 약관 기본값 → 서버
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && exec npx next start -p 3000"]
