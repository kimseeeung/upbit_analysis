-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RollbackResult" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendReason" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OperatorAccount" (
    "id" TEXT NOT NULL,
    "loginId" TEXT,
    "passwordHash" TEXT,
    "passwordSalt" TEXT,
    "rollbackPinHash" TEXT,
    "rollbackPinSalt" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "OperatorStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" TEXT,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledById" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "rollbackPinFailCount" INTEGER NOT NULL DEFAULT 0,
    "rollbackLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorLoginChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "smsVerificationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAlert" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeployVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deployedBy" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollbackLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "healthCheck" JSONB,
    "result" "RollbackResult" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,

    CONSTRAINT "RollbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAccessLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAccount_loginId_key" ON "OperatorAccount"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAccount_inviteTokenHash_key" ON "OperatorAccount"("inviteTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSession_tokenHash_key" ON "OperatorSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OperatorSession_operatorId_revokedAt_idx" ON "OperatorSession"("operatorId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorLoginChallenge_tokenHash_key" ON "OperatorLoginChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "OperatorAlert_operatorId_readAt_idx" ON "OperatorAlert"("operatorId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeployVersion_version_key" ON "DeployVersion"("version");

-- CreateIndex
CREATE INDEX "OperatorAccessLog_targetUserId_at_idx" ON "OperatorAccessLog"("targetUserId", "at");

-- CreateIndex
CREATE INDEX "OperatorAccessLog_operatorId_at_idx" ON "OperatorAccessLog"("operatorId", "at");

-- CreateIndex
CREATE INDEX "Inquiry_userId_createdAt_idx" ON "Inquiry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "OperatorAccount" ADD CONSTRAINT "OperatorAccount_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "OperatorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSession" ADD CONSTRAINT "OperatorSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLoginChallenge" ADD CONSTRAINT "OperatorLoginChallenge_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorAlert" ADD CONSTRAINT "OperatorAlert_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollbackLog" ADD CONSTRAINT "RollbackLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorAccessLog" ADD CONSTRAINT "OperatorAccessLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
