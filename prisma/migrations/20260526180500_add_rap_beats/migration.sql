ALTER TABLE "Battle" ADD COLUMN "rapBeatId" TEXT;

CREATE TABLE "RapBeat" (
    "id" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "averageRating" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "isApprovedForRapPool" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RapBeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RapBeat_fileUrl_key" ON "RapBeat"("fileUrl");
CREATE INDEX "RapBeat_isApprovedForRapPool_idx" ON "RapBeat"("isApprovedForRapPool");
CREATE INDEX "RapBeat_averageRating_idx" ON "RapBeat"("averageRating");
CREATE INDEX "Battle_rapBeatId_idx" ON "Battle"("rapBeatId");

ALTER TABLE "Battle" ADD CONSTRAINT "Battle_rapBeatId_fkey" FOREIGN KEY ("rapBeatId") REFERENCES "RapBeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
