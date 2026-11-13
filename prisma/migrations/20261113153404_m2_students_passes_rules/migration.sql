-- CreateEnum
CREATE TYPE "TrainerStudentLinkStatus" AS ENUM ('ACTIVE', 'ENDED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "RuleSetKind" AS ENUM ('TRAINER_DEFAULT', 'CENTER_DEFAULT', 'PASS');

-- CreateEnum
CREATE TYPE "PassStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED', 'REFUNDED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RuleConsentStatus" AS ENUM ('PENDING', 'AGREED', 'INQUIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'PENDING_CONFIRM', 'CONFIRMED', 'INSUFFICIENT', 'PENDING_APPROVAL', 'COMPLETED', 'NO_SHOW', 'CANCELED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('TRAINER', 'STUDENT');

-- CreateEnum
CREATE TYPE "DeductReason" AS ENUM ('COMPLETED', 'NO_SHOW', 'LATE_CANCEL');

-- CreateTable
CREATE TABLE "TrainerStudentLink" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "memo" TEXT NOT NULL DEFAULT '',
    "memoTransferred" BOOLEAN NOT NULL DEFAULT false,
    "notifyDayBefore" BOOLEAN NOT NULL DEFAULT true,
    "notify2h" BOOLEAN NOT NULL DEFAULT true,
    "status" "TrainerStudentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerStudentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "kind" "RuleSetKind" NOT NULL,
    "ownerTrainerId" TEXT,
    "ownerCenterId" TEXT,
    "version" INTEGER NOT NULL,
    "lateCancelHours" INTEGER NOT NULL DEFAULT 24,
    "lateCancelDeduct" BOOLEAN NOT NULL DEFAULT true,
    "noShowMinutes" INTEGER NOT NULL DEFAULT 15,
    "noShowDeduct" BOOLEAN NOT NULL DEFAULT true,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 15,
    "unapprovedAutoCompleteDays" INTEGER NOT NULL DEFAULT 7,
    "changeDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "pauseMaxDays" INTEGER NOT NULL DEFAULT 30,
    "pauseMaxCount" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pass" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "soldByTrainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "bonusCount" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 50,
    "price" INTEGER,
    "paidAt" TIMESTAMP(3),
    "payMethod" TEXT,
    "memo" TEXT,
    "ruleSetVersionId" TEXT NOT NULL,
    "agreedRuleSetId" TEXT,
    "agreedAt" TIMESTAMP(3),
    "status" "PassStatus" NOT NULL DEFAULT 'ACTIVE',
    "refundedAt" TIMESTAMP(3),
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "deductedNoShow" INTEGER NOT NULL DEFAULT 0,
    "deductedLateCancel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassChangeLog" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConsent" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "ruleSetVersionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "RuleConsentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreedAt" TIMESTAMP(3),
    "inquiredAt" TIMESTAMP(3),
    "inquiryText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "passId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "source" "BookingSource" NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "deducted" BOOLEAN NOT NULL DEFAULT false,
    "deductReason" "DeductReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerStudentLink_trainerId_status_idx" ON "TrainerStudentLink"("trainerId", "status");

-- CreateIndex
CREATE INDEX "TrainerStudentLink_studentId_endedAt_idx" ON "TrainerStudentLink"("studentId", "endedAt");

-- CreateIndex
CREATE INDEX "RuleSet_ownerTrainerId_kind_version_idx" ON "RuleSet"("ownerTrainerId", "kind", "version");

-- CreateIndex
CREATE INDEX "Pass_studentId_status_idx" ON "Pass"("studentId", "status");

-- CreateIndex
CREATE INDEX "PassChangeLog_passId_changedAt_idx" ON "PassChangeLog"("passId", "changedAt");

-- CreateIndex
CREATE INDEX "RuleConsent_studentId_status_idx" ON "RuleConsent"("studentId", "status");

-- CreateIndex
CREATE INDEX "RuleConsent_passId_status_idx" ON "RuleConsent"("passId", "status");

-- CreateIndex
CREATE INDEX "Booking_studentId_status_idx" ON "Booking"("studentId", "status");

-- CreateIndex
CREATE INDEX "Booking_trainerId_startAt_idx" ON "Booking"("trainerId", "startAt");

-- AddForeignKey
ALTER TABLE "TrainerStudentLink" ADD CONSTRAINT "TrainerStudentLink_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerStudentLink" ADD CONSTRAINT "TrainerStudentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_ownerTrainerId_fkey" FOREIGN KEY ("ownerTrainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_soldByTrainerId_fkey" FOREIGN KEY ("soldByTrainerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "RuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_agreedRuleSetId_fkey" FOREIGN KEY ("agreedRuleSetId") REFERENCES "RuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassChangeLog" ADD CONSTRAINT "PassChangeLog_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConsent" ADD CONSTRAINT "RuleConsent_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConsent" ADD CONSTRAINT "RuleConsent_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "RuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConsent" ADD CONSTRAINT "RuleConsent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
