import {
  AUDIO_ANALYSIS_VERSION,
  analyzeAndCacheRapBeat,
  getAudioHash,
  getPublicAudioFilePath,
} from "@/lib/audio-analysis";
import { scanGlobalLocalRapBeats } from "@/lib/sound-library/local-library";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

function shouldForce() {
  return process.argv.includes("--force");
}

function shouldAnalyzeNewOnly() {
  return process.argv.includes("--new");
}

async function main() {
  const force = shouldForce();
  const newOnly = shouldAnalyzeNewOnly();
  const defaultConcurrency = process.platform === "win32" ? 1 : 2;
  const concurrency = Math.max(
    1,
    Math.min(
      4,
      Number(process.env.ANALYZER_CONCURRENCY ?? String(defaultConcurrency)) ||
        defaultConcurrency,
    ),
  );
  const beats = scanGlobalLocalRapBeats();
  const startedAt = Date.now();
  const summary = {
    analyzed: 0,
    withBpm: 0,
    withKey: 0,
    nullResults: [] as string[],
    lowConfidence: [] as string[],
  };

  const queued: Array<{ beat: (typeof beats)[number]; rapBeatId: string }> = [];

  for (const beat of beats) {
    const filePath = getPublicAudioFilePath(beat.fileUrl);
    if (!filePath) {
      console.warn("Skipping missing beat", beat.fileUrl);
      continue;
    }
    const audioHash = getAudioHash(filePath);

    const rapBeat = await prisma.rapBeat.upsert({
      where: {
        fileUrl: beat.fileUrl,
      },
      update: {
        fileName: beat.fileName,
        title: beat.fileName,
      },
      create: {
        fileUrl: beat.fileUrl,
        fileName: beat.fileName,
        title: beat.fileName,
        producerUsername: "test_user",
      },
      select: {
        id: true,
        fileUrl: true,
        analysisStatus: true,
        detectedBpm: true,
        analyzedAt: true,
        analysisVersion: true,
        audioHash: true,
      },
    });

    const isStale =
      rapBeat.analysisStatus !== "COMPLETE" ||
      rapBeat.detectedBpm === null ||
      !rapBeat.analyzedAt ||
      rapBeat.analysisVersion !== AUDIO_ANALYSIS_VERSION ||
      rapBeat.audioHash !== audioHash;

    if (force || (newOnly ? isStale : isStale)) {
      if (force) {
        await prisma.rapBeat.update({
          where: {
            id: rapBeat.id,
          },
          data: {
            detectedBpm: null,
            bpmConfidence: null,
            beatGridConfidence: null,
            detectedKey: null,
            detectedMode: null,
            keyConfidence: null,
            keyCertainty: null,
            tuningCents: null,
            referenceAHz: null,
            audioHash: null,
            analyzedAt: null,
            analysisStatus: "PENDING",
            analysisSource: null,
            analysisVersion: null,
            manualBpm: null,
            manualKey: null,
            manualMode: null,
            bpmCandidatesJson: null,
            keyCandidatesJson: null,
          },
        });
      }

      queued.push({ beat, rapBeatId: rapBeat.id });
    }
  }

  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < queued.length) {
      const item = queued[nextIndex];
      nextIndex += 1;
      const index = nextIndex;
      const elapsed = (Date.now() - startedAt) / 1000;
      const average = completed > 0 ? elapsed / completed : 0;
      const remaining = average > 0 ? Math.round((queued.length - completed) * average) : null;
      console.log(
        `[${index}/${queued.length}] analyzing ${item.beat.fileName}.mp3 elapsed=${Math.round(elapsed)}s eta=${remaining ?? "?"}s`,
      );

      try {
        const result = await analyzeAndCacheRapBeat(prisma, item.rapBeatId);
        summary.analyzed += 1;
        if (result?.bpm !== null && result?.bpm !== undefined) {
          summary.withBpm += 1;
        }
        if (result?.key) {
          summary.withKey += 1;
        }
        if (!result?.bpm && !result?.key) {
          summary.nullResults.push(item.beat.fileName);
        }
        if (
          (result?.bpm !== null &&
            result?.bpm !== undefined &&
            (result.bpmConfidence ?? 0) < 0.65) ||
          (result?.key && (result.keyConfidence ?? 0) < 0.45)
        ) {
          summary.lowConfidence.push(
            `${item.beat.fileName} bpm=${result?.bpmConfidence ?? 0} key=${result?.keyConfidence ?? 0}`,
          );
        }
        console.log(
          JSON.stringify({
            fileUrl: item.beat.fileUrl,
            bpm: result?.bpm ?? null,
            key: result?.key ?? null,
            mode: result?.mode ?? null,
            source: result?.source ?? null,
          }),
        );
      } catch (error) {
        summary.nullResults.push(item.beat.fileName);
        console.error(`Analysis failed for ${item.beat.fileName}`, error);
      } finally {
        completed += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(
    JSON.stringify({
      summary,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
