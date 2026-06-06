-- Replace the old one-row-per-participant vote shape with one ranked ballot per voter.
DROP TABLE "Vote";

CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "firstPlaceParticipantId" TEXT NOT NULL,
    "secondPlaceParticipantId" TEXT NOT NULL,
    "thirdPlaceParticipantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vote_battleId_voterId_key" ON "Vote"("battleId", "voterId");
CREATE INDEX "Vote_battleId_idx" ON "Vote"("battleId");
CREATE INDEX "Vote_voterId_idx" ON "Vote"("voterId");
CREATE INDEX "Vote_firstPlaceParticipantId_idx" ON "Vote"("firstPlaceParticipantId");
CREATE INDEX "Vote_secondPlaceParticipantId_idx" ON "Vote"("secondPlaceParticipantId");
CREATE INDEX "Vote_thirdPlaceParticipantId_idx" ON "Vote"("thirdPlaceParticipantId");

ALTER TABLE "Vote" ADD CONSTRAINT "Vote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_firstPlaceParticipantId_fkey" FOREIGN KEY ("firstPlaceParticipantId") REFERENCES "BattleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_secondPlaceParticipantId_fkey" FOREIGN KEY ("secondPlaceParticipantId") REFERENCES "BattleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_thirdPlaceParticipantId_fkey" FOREIGN KEY ("thirdPlaceParticipantId") REFERENCES "BattleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
