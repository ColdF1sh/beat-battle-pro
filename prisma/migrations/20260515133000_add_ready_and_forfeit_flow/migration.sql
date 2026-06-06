-- AlterEnum
ALTER TYPE "BattleStatus" ADD VALUE 'READY';

-- AlterTable
ALTER TABLE "BattleParticipant" ADD COLUMN "leftAt" TIMESTAMP(3);
ALTER TABLE "BattleParticipant" ADD COLUMN "forfeited" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BattleReadyCheck" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleReadyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BattleReadyCheck_battleId_userId_key" ON "BattleReadyCheck"("battleId", "userId");

-- CreateIndex
CREATE INDEX "BattleReadyCheck_battleId_idx" ON "BattleReadyCheck"("battleId");

-- CreateIndex
CREATE INDEX "BattleReadyCheck_userId_idx" ON "BattleReadyCheck"("userId");

-- CreateIndex
CREATE INDEX "BattleReadyCheck_isReady_idx" ON "BattleReadyCheck"("isReady");

-- AddForeignKey
ALTER TABLE "BattleReadyCheck" ADD CONSTRAINT "BattleReadyCheck_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleReadyCheck" ADD CONSTRAINT "BattleReadyCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
