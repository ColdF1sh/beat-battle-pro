-- AlterTable
ALTER TABLE "Battle" ADD COLUMN "eloProcessed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "BattleEloResult_battleId_userId_key" ON "BattleEloResult"("battleId", "userId");
