-- CreateEnum
CREATE TYPE "ApprovalMethod" AS ENUM ('PIN_ONSITE', 'PIN_APP', 'AUTO', 'TRAINER_CONFIRM', 'DISPUTE_RESOLUTION');

-- CreateEnum
CREATE TYPE "DisputeKind" AS ENUM ('COMPLETION_REJECTED', 'NO_SHOW_OBJECTION');

-- CreateEnum
CREATE TYPE "DisputeDecision" AS ENUM ('ACCEPT_STUDENT', 'KEEP');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "approvalMethod" "ApprovalMethod",
ADD COLUMN     "approvalRequestedAt" TIMESTAMP(3),
ADD COLUMN     "approvalRequestedBy" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "disputeAt" TIMESTAMP(3),
ADD COLUMN     "disputeKind" "DisputeKind",
ADD COLUMN     "disputeResolvedAt" TIMESTAMP(3),
ADD COLUMN     "disputeStudentReason" TEXT,
ADD COLUMN     "disputeTrainerDecision" "DisputeDecision",
ADD COLUMN     "disputeTrainerReason" TEXT,
ADD COLUMN     "disputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trainerConfirmNeeded" BOOLEAN NOT NULL DEFAULT false;
