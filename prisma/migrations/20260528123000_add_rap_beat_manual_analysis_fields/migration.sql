ALTER TABLE "RapBeat" ADD COLUMN "analysisSource" TEXT;
ALTER TABLE "RapBeat" ADD COLUMN "manualBpm" DOUBLE PRECISION;
ALTER TABLE "RapBeat" ADD COLUMN "manualKey" TEXT;
ALTER TABLE "RapBeat" ADD COLUMN "manualMode" TEXT;

UPDATE "RapBeat"
SET "analysisSource" = CASE
  WHEN "analysisStatus" = 'COMPLETE' THEN 'auto'
  ELSE NULL
END
WHERE "analysisSource" IS NULL;
