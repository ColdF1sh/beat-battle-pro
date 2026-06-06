-- AlterTable
ALTER TABLE "Battle" ADD COLUMN "submissionStartedAt" TIMESTAMP(3);
ALTER TABLE "Battle" ADD COLUMN "submissionEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BattleParticipant" ADD COLUMN "missedSubmission" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BattleParticipant" ADD COLUMN "technicalLoss" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BattleMessage" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BattleMessage_battleId_idx" ON "BattleMessage"("battleId");

-- CreateIndex
CREATE INDEX "BattleMessage_userId_idx" ON "BattleMessage"("userId");

-- CreateIndex
CREATE INDEX "BattleMessage_createdAt_idx" ON "BattleMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "BattleMessage" ADD CONSTRAINT "BattleMessage_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleMessage" ADD CONSTRAINT "BattleMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
