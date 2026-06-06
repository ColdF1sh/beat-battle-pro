-- AlterEnum
ALTER TYPE "BattleStatus" ADD VALUE 'DRAFTING';

-- CreateTable
CREATE TABLE "BattleDraft" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "currentCategory" TEXT NOT NULL DEFAULT 'genre',
    "currentTurnIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "finalGenre" TEXT,
    "finalBpm" TEXT,
    "finalKey" TEXT,
    "finalDurationMinutes" INTEGER,
    "turnStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleDraftBan" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "option" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleDraftBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BattleDraft_battleId_key" ON "BattleDraft"("battleId");

-- CreateIndex
CREATE INDEX "BattleDraft_battleId_idx" ON "BattleDraft"("battleId");

-- CreateIndex
CREATE INDEX "BattleDraft_status_idx" ON "BattleDraft"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BattleDraftBan_draftId_category_option_key" ON "BattleDraftBan"("draftId", "category", "option");

-- CreateIndex
CREATE UNIQUE INDEX "BattleDraftBan_draftId_turnIndex_key" ON "BattleDraftBan"("draftId", "turnIndex");

-- CreateIndex
CREATE INDEX "BattleDraftBan_battleId_idx" ON "BattleDraftBan"("battleId");

-- CreateIndex
CREATE INDEX "BattleDraftBan_participantId_idx" ON "BattleDraftBan"("participantId");

-- CreateIndex
CREATE INDEX "BattleDraftBan_userId_idx" ON "BattleDraftBan"("userId");

-- AddForeignKey
ALTER TABLE "BattleDraft" ADD CONSTRAINT "BattleDraft_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleDraftBan" ADD CONSTRAINT "BattleDraftBan_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "BattleDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleDraftBan" ADD CONSTRAINT "BattleDraftBan_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleDraftBan" ADD CONSTRAINT "BattleDraftBan_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "BattleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleDraftBan" ADD CONSTRAINT "BattleDraftBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
