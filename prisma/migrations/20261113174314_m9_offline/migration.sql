-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "offlineOrigin" JSONB;

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "localChange" JSONB NOT NULL,
    "serverState" JSONB,
    "reason" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "localAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncConflict_trainerId_resolvedAt_idx" ON "SyncConflict"("trainerId", "resolvedAt");
