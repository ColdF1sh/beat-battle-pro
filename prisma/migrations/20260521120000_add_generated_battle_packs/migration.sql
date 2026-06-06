-- CreateTable
CREATE TABLE "GeneratedBattlePack" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'GLOBAL_LIBRARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedBattlePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedBattlePackSound" (
    "id" TEXT NOT NULL,
    "generatedPackId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "slot" TEXT,

    CONSTRAINT "GeneratedBattlePackSound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedBattlePack_battleId_key" ON "GeneratedBattlePack"("battleId");

-- CreateIndex
CREATE INDEX "GeneratedBattlePack_battleId_idx" ON "GeneratedBattlePack"("battleId");

-- CreateIndex
CREATE INDEX "GeneratedBattlePack_sourceType_idx" ON "GeneratedBattlePack"("sourceType");

-- CreateIndex
CREATE INDEX "GeneratedBattlePackSound_generatedPackId_idx" ON "GeneratedBattlePackSound"("generatedPackId");

-- CreateIndex
CREATE INDEX "GeneratedBattlePackSound_category_idx" ON "GeneratedBattlePackSound"("category");

-- AddForeignKey
ALTER TABLE "GeneratedBattlePack" ADD CONSTRAINT "GeneratedBattlePack_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedBattlePackSound" ADD CONSTRAINT "GeneratedBattlePackSound_generatedPackId_fkey" FOREIGN KEY ("generatedPackId") REFERENCES "GeneratedBattlePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
