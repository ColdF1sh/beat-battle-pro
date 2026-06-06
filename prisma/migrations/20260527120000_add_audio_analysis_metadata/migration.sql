ALTER TABLE "RapBeat" ADD COLUMN "detectedBpm" DOUBLE PRECISION;
ALTER TABLE "RapBeat" ADD COLUMN "bpmConfidence" DOUBLE PRECISION;
ALTER TABLE "RapBeat" ADD COLUMN "detectedKey" TEXT;
ALTER TABLE "RapBeat" ADD COLUMN "detectedMode" TEXT;
ALTER TABLE "RapBeat" ADD COLUMN "keyConfidence" DOUBLE PRECISION;
ALTER TABLE "RapBeat" ADD COLUMN "analyzedAt" TIMESTAMP(3);

ALTER TABLE "BattleSubmission" ADD COLUMN "detectedBpm" DOUBLE PRECISION;
ALTER TABLE "BattleSubmission" ADD COLUMN "bpmConfidence" DOUBLE PRECISION;
ALTER TABLE "BattleSubmission" ADD COLUMN "detectedKey" TEXT;
ALTER TABLE "BattleSubmission" ADD COLUMN "detectedMode" TEXT;
ALTER TABLE "BattleSubmission" ADD COLUMN "keyConfidence" DOUBLE PRECISION;
ALTER TABLE "BattleSubmission" ADD COLUMN "analyzedAt" TIMESTAMP(3);
ALTER TABLE "BattleSubmission" ADD COLUMN "rulePenalty" DOUBLE PRECISION;
