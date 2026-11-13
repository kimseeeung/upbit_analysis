-- AlterTable
ALTER TABLE "User" ADD COLUMN     "withdrawReason" TEXT;

-- CreateTable
CREATE TABLE "DeletionTombstone" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeletionTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletionTombstone_deletedAt_idx" ON "DeletionTombstone"("deletedAt");
