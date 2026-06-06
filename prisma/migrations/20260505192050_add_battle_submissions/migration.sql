-- CreateTable
CREATE TABLE "BattleSubmission" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BattleSubmission_participantId_key" ON "BattleSubmission"("participantId");

-- CreateIndex
CREATE INDEX "BattleSubmission_battleId_idx" ON "BattleSubmission"("battleId");

-- CreateIndex
CREATE INDEX "BattleSubmission_userId_idx" ON "BattleSubmission"("userId");

-- CreateIndex
CREATE INDEX "BattleSubmission_createdAt_idx" ON "BattleSubmission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BattleSubmission_battleId_participantId_key" ON "BattleSubmission"("battleId", "participantId");

-- AddForeignKey
ALTER TABLE "BattleSubmission" ADD CONSTRAINT "BattleSubmission_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleSubmission" ADD CONSTRAINT "BattleSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleSubmission" ADD CONSTRAINT "BattleSubmission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "BattleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
