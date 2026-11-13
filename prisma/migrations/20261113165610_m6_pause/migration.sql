-- CreateEnum
CREATE TYPE "PassPauseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ENDED_EARLY', 'CANCELED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "lateCancel" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PassPause" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PassPauseStatus" NOT NULL DEFAULT 'PENDING',
    "actualEndDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PassPause_passId_status_idx" ON "PassPause"("passId", "status");

-- AddForeignKey
ALTER TABLE "PassPause" ADD CONSTRAINT "PassPause_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
