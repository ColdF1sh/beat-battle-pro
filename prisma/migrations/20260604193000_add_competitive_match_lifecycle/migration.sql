-- Competitive match lifecycle / reconnect / abandon state.
CREATE TYPE "BattleParticipantPresence" AS ENUM (
  'CONNECTED',
  'DISCONNECTED',
  'RECONNECTED',
  'ABANDONED'
);

ALTER TABLE "BattleParticipant"
  ADD COLUMN "presenceStatus" "BattleParticipantPresence" NOT NULL DEFAULT 'CONNECTED',
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "connectedAt" TIMESTAMP(3),
  ADD COLUMN "disconnectedAt" TIMESTAMP(3),
  ADD COLUMN "reconnectedAt" TIMESTAMP(3),
  ADD COLUMN "abandonedAt" TIMESTAMP(3),
  ADD COLUMN "abandonReason" TEXT,
  ADD COLUMN "leavePenaltyAppliedAt" TIMESTAMP(3),
  ADD COLUMN "leavePenaltyElo" INTEGER,
  ADD COLUMN "reconnectExpiresAt" TIMESTAMP(3);

CREATE INDEX "BattleParticipant_presenceStatus_idx" ON "BattleParticipant"("presenceStatus");
CREATE INDEX "BattleParticipant_reconnectExpiresAt_idx" ON "BattleParticipant"("reconnectExpiresAt");
