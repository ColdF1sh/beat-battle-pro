-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "soundPackId" TEXT;

-- CreateTable
CREATE TABLE "SoundPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoundPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundPackSound" (
    "id" TEXT NOT NULL,
    "soundPackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundPackSound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoundPack_isActive_idx" ON "SoundPack"("isActive");

-- CreateIndex
CREATE INDEX "SoundPackSound_soundPackId_idx" ON "SoundPackSound"("soundPackId");

-- CreateIndex
CREATE INDEX "Battle_soundPackId_idx" ON "Battle"("soundPackId");

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_soundPackId_fkey" FOREIGN KEY ("soundPackId") REFERENCES "SoundPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundPackSound" ADD CONSTRAINT "SoundPackSound_soundPackId_fkey" FOREIGN KEY ("soundPackId") REFERENCES "SoundPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
