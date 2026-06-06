-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "Battle_source_idx" ON "Battle"("source");
