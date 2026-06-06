-- CreateTable
CREATE TABLE "BattleEloResult" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldElo" INTEGER NOT NULL,
    "newElo" INTEGER NOT NULL,
    "eloChange" INTEGER NOT NULL,
    "placement" INTEGER NOT NULL,
    "totalVotePoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleEloResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BattleEloResult_battleId_idx" ON "BattleEloResult"("battleId");

-- CreateIndex
CREATE INDEX "BattleEloResult_userId_idx" ON "BattleEloResult"("userId");

-- AddForeignKey
ALTER TABLE "BattleEloResult" ADD CONSTRAINT "BattleEloResult_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleEloResult" ADD CONSTRAINT "BattleEloResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
