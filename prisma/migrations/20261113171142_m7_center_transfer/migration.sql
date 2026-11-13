-- CreateEnum
CREATE TYPE "TransferInitiator" AS ENUM ('STUDENT', 'TRAINER', 'CENTER_ADMIN');

-- CreateEnum
CREATE TYPE "PassTransferStatus" AS ENUM ('PENDING', 'AGREED', 'REFUSED', 'CENTER_APPROVED', 'NOT_NEEDED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING_TRAINER', 'PENDING_STUDENT', 'COMPLETED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DepartureType" AS ENUM ('MOVE', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "DepartureChoiceKind" AS ENUM ('FOLLOW', 'STAY', 'CENTER_ASSIGN', 'FIND_OWN');

-- CreateEnum
CREATE TYPE "CenterInviteKind" AS ENUM ('TRAINER', 'ADMIN');

-- CreateTable
CREATE TABLE "TransferRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromTrainerId" TEXT,
    "toTrainerId" TEXT NOT NULL,
    "initiatedBy" "TransferInitiator" NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "centerId" TEXT,
    "toTrainerAcceptedAt" TIMESTAMP(3),
    "studentAgreedAt" TIMESTAMP(3),
    "passTransfer" "PassTransferStatus" NOT NULL,
    "passDecidedAt" TIMESTAMP(3),
    "passDecidedBy" TEXT,
    "bookingDecisions" JSONB,
    "memoTransfer" BOOLEAN NOT NULL DEFAULT false,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING_TRAINER',
    "completedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerDeparture" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "type" "DepartureType" NOT NULL,
    "fromCenterId" TEXT,
    "targetCenterId" TEXT,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartureChoice" (
    "id" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "choice" "DepartureChoiceKind",
    "chosenAt" TIMESTAMP(3),
    "defaulted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartureChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterInvite" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "kind" "CenterInviteKind" NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferRequest_studentId_status_idx" ON "TransferRequest"("studentId", "status");

-- CreateIndex
CREATE INDEX "TransferRequest_toTrainerId_status_idx" ON "TransferRequest"("toTrainerId", "status");

-- CreateIndex
CREATE INDEX "TransferRequest_fromTrainerId_passTransfer_idx" ON "TransferRequest"("fromTrainerId", "passTransfer");

-- CreateIndex
CREATE INDEX "TrainerDeparture_trainerId_appliedAt_idx" ON "TrainerDeparture"("trainerId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepartureChoice_departureId_studentId_key" ON "DepartureChoice"("departureId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterInvite_code_key" ON "CenterInvite"("code");

-- AddForeignKey
ALTER TABLE "DepartureChoice" ADD CONSTRAINT "DepartureChoice_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "TrainerDeparture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
