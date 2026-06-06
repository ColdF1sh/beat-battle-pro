import { analyzeAndCacheRapBeat, getPublicAudioFilePath } from "@/lib/audio-analysis";
import {
  type GlobalLocalRapBeat,
  scanGlobalLocalRapBeats,
} from "@/lib/sound-library/local-library";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

function shouldForce() {
  return process.argv.includes("--force");
}

function shouldAllowAll() {
  return process.argv.includes("--all");
}

function shouldForceFull() {
  return process.argv.includes("--full");
}

function getBeatArg() {
  return process.argv
    .slice(2)
    .find((arg) => arg !== "--force" && arg !== "--all" && arg !== "--full");
}

function resolveBeats(input: string) {
  const normalized = input.toLowerCase();
  const beats = scanGlobalLocalRapBeats();
  const exact = beats.find(
    (beat) =>
      beat.fileName.toLowerCase() === normalized ||
      `${beat.fileName}.mp3`.toLowerCase() === normalized,
  );

  if (exact) {
    return [exact];
  }

  const matches = beats.filter((beat) =>
    beat.fileName.toLowerCase().includes(normalized),
  );

  if (matches.length === 1) {
    return matches;
  }

  if (matches.length > 1) {
    return matches;
  }

  throw new Error(`Could not find beat matching "${input}"`);
}

async function analyzeBeat(beat: GlobalLocalRapBeat, force: boolean, full: boolean) {
  if (!getPublicAudioFilePath(beat.fileUrl)) {
    throw new Error(`Beat file is missing on disk: ${beat.fileUrl}`);
  }

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
      fileName: true,
      analysisStatus: true,
    },
  });

  if (force) {
    await prisma.rapBeat.update({
      where: {
        id: rapBeat.id,
      },
      data: {
        detectedBpm: null,
        bpmConfidence: null,
        beatGridConfidence: null,
        referenceAHz: null,
        detectedKey: null,
        detectedMode: null,
        keyConfidence: null,
        keyCertainty: null,
        tuningCents: null,
        analyzedAt: null,
        analysisStatus: "PENDING",
        analysisSource: null,
        analysisVersion: null,
        audioHash: null,
        manualBpm: null,
        manualKey: null,
        manualMode: null,
        bpmCandidatesJson: null,
        keyCandidatesJson: null,
      },
    });
  }

  const result = await analyzeAndCacheRapBeat(prisma, rapBeat.id, {
    mode: full ? "full" : "staged",
  });

  console.log(
    JSON.stringify({
      fileUrl: beat.fileUrl,
      fileName: beat.fileName,
      forced: force,
      bpm: result?.bpm ?? null,
      bpmConfidence: result?.bpmConfidence ?? 0,
      beatGridConfidence: result?.beatGridConfidence ?? 0,
      key: result?.key ?? null,
      mode: result?.mode ?? null,
      keyConfidence: result?.keyConfidence ?? 0,
      keyCertainty: result?.keyCertainty ?? "UNKNOWN",
      referenceAHz: result?.referenceAHz ?? null,
      source: result?.source ?? null,
      stage: result?.analysisStage ?? null,
      timings: result?.timings ?? null,
      analysisVersion: result?.analysisVersion ?? null,
      bpmCandidates: result?.bpmCandidates ?? [],
      keyCandidates: result?.keyCandidates ?? [],
    }, null, 2),
  );
}

async function main() {
  const beatArg = getBeatArg();

  if (!beatArg) {
    console.error('Usage: pnpm beats:analyze:file "BeatName.mp3"');
    process.exitCode = 1;
    return;
  }

  const force = shouldForce();
  const full = shouldForceFull();
  const beats = resolveBeats(beatArg);

  if (beats.length > 1 && !shouldAllowAll()) {
    console.error(
      `Multiple beats match "${beatArg}". Use an exact name or pass --all:\n${beats
        .map((beat) => `- ${beat.fileName}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  for (const beat of beats) {
    await analyzeBeat(beat, force, full);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
