-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);
