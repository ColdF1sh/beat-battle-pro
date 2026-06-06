/*
  Warnings:

  - Changed the type of `mode` on the `Battle` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MatchmakingQueueStatus" AS ENUM ('SEARCHING', 'MATCHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Battle" DROP COLUMN "mode",
ADD COLUMN     "mode" TEXT NOT NULL;

-- DropEnum
DROP TYPE "BattleMode";

-- CreateTable
CREATE TABLE "MatchmakingQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "MatchmakingQueueStatus" NOT NULL DEFAULT 'SEARCHING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchmakingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchmakingQueue_userId_idx" ON "MatchmakingQueue"("userId");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_mode_idx" ON "MatchmakingQueue"("mode");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_status_idx" ON "MatchmakingQueue"("status");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_createdAt_idx" ON "MatchmakingQueue"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchmakingQueue_userId_mode_status_key" ON "MatchmakingQueue"("userId", "mode", "status");

-- CreateIndex
CREATE INDEX "Battle_mode_idx" ON "Battle"("mode");

-- AddForeignKey
ALTER TABLE "MatchmakingQueue" ADD CONSTRAINT "MatchmakingQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
