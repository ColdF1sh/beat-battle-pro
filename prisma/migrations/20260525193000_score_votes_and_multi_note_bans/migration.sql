DROP TABLE "Vote";

CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vote_battleId_voterId_participantId_key" ON "Vote"("battleId", "voterId", "participantId");
CREATE INDEX "Vote_battleId_idx" ON "Vote"("battleId");
CREATE INDEX "Vote_voterId_idx" ON "Vote"("voterId");
CREATE INDEX "Vote_participantId_idx" ON "Vote"("participantId");

ALTER TABLE "Vote" ADD CONSTRAINT "Vote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "BattleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "BattleDraftBan_draftId_turnIndex_key";
