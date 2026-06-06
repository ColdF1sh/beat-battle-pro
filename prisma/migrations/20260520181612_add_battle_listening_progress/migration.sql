-- CreateTable
CREATE TABLE "BattleListeningProgress" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleListeningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BattleListeningProgress_battleId_idx" ON "BattleListeningProgress"("battleId");

-- CreateIndex
CREATE INDEX "BattleListeningProgress_userId_idx" ON "BattleListeningProgress"("userId");

-- CreateIndex
CREATE INDEX "BattleListeningProgress_completed_idx" ON "BattleListeningProgress"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "BattleListeningProgress_battleId_userId_key" ON "BattleListeningProgress"("battleId", "userId");

-- AddForeignKey
ALTER TABLE "BattleListeningProgress" ADD CONSTRAINT "BattleListeningProgress_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleListeningProgress" ADD CONSTRAINT "BattleListeningProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
