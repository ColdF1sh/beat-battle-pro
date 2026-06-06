import { analyzeAndCacheRapBeat, getPublicAudioFilePath } from "@/lib/audio-analysis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

async function main() {
  const shouldClear = process.argv.includes("--clear");
  const beats = await prisma.rapBeat.findMany({
    select: {
      id: true,
      fileUrl: true,
      analysisSource: true,
      bpmConfidence: true,
      keyConfidence: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const beat of beats) {
    if (!getPublicAudioFilePath(beat.fileUrl)) {
      console.warn("Skipping missing local beat", beat.fileUrl);
      continue;
    }

    const lowConfidence =
      (beat.bpmConfidence ?? 0) < 0.65 || (beat.keyConfidence ?? 0) < 0.2;

    if (shouldClear || beat.analysisSource === "auto" || lowConfidence) {
      await prisma.rapBeat.update({
        where: {
          id: beat.id,
        },
        data: {
          detectedBpm: null,
          bpmConfidence: null,
          detectedKey: null,
          detectedMode: null,
          keyConfidence: null,
          tuningCents: null,
          analyzedAt: null,
          analysisStatus: "PENDING",
          analysisSource: null,
          manualBpm: null,
          manualKey: null,
          manualMode: null,
          bpmCandidatesJson: null,
          keyCandidatesJson: null,
        },
      });

      const result = await analyzeAndCacheRapBeat(prisma, beat.id);
      console.log(
        JSON.stringify({
          fileUrl: beat.fileUrl,
          bpm: result?.bpm ?? null,
          key: result?.key ?? null,
          mode: result?.mode ?? null,
          source: result?.source ?? null,
        }),
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
