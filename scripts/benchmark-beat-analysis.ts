import { SHARP_NOTES, getTempoClassDiff, normalizeKeyName } from "@/lib/rule-compliance";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

const EXPECTED = [
  { file: "Beat54.mp3", stem: "Beat54", expectedBpm: 160, expectedKey: "C#", expectedMode: "minor" },
  { file: "Beat61.mp3", stem: "Beat61", expectedBpm: 86, expectedKey: "E", expectedMode: "minor" },
  { file: "Beat63.mp3", stem: "Beat63", expectedBpm: 90, expectedKey: "A", expectedMode: "minor" },
  { file: "Beat65.mp3", stem: "Beat65", expectedBpm: 135, expectedKey: "A#", expectedMode: "minor" },
  { file: "Beat66.mp3", stem: "Beat66", expectedBpm: 90, expectedKey: "B", expectedMode: "minor" },
  { file: "Beat59.mp3", stem: "Beat59", expectedBpm: 144, expectedKey: "B", expectedMode: "minor" },
  { file: "lif3.mp3", stem: "lif3", expectedBpm: 130, expectedKey: "G", expectedMode: "minor" },
  { file: "SCADI.mp3", stem: "SCADI", expectedBpm: 130, expectedKey: "E", expectedMode: "minor" },
  { file: "Beat44.mp3", stem: "Beat44", expectedBpm: 125, expectedKey: "G#", expectedMode: "minor" },
  { file: "Beat46.mp3", stem: "Beat46", expectedBpm: 142, expectedKey: "A#", expectedMode: "major" },
  { file: "Beat50.mp3", stem: "Beat50", expectedBpm: 120, expectedKey: "C", expectedMode: "minor" },
  { file: "Beat39.mp3", stem: "Beat39", expectedBpm: 110, expectedKey: "G", expectedMode: "major" },
  { file: "revenge.mp3", stem: "revenge", expectedBpm: 140, expectedKey: "", expectedMode: "" },
] as const;

function format(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function keyOk({
  expectedKey,
  expectedMode,
  detectedKey,
  detectedMode,
}: {
  expectedKey: string;
  expectedMode: string;
  detectedKey: string | null;
  detectedMode: string | null;
}) {
  const expected = normalizeKeyName(expectedKey);
  const detected = normalizeKeyName(detectedKey);

  return Boolean(
    expected &&
      detected &&
      expected === detected &&
      expectedMode.toLowerCase() === detectedMode?.toLowerCase(),
  );
}

function circleOfFifthsDistance(leftIndex: number, rightIndex: number) {
  const leftPosition = (leftIndex * 7) % 12;
  const rightPosition = (rightIndex * 7) % 12;
  const distance = Math.abs(leftPosition - rightPosition);

  return Math.min(distance, 12 - distance);
}

function keyRelationship({
  expectedKey,
  expectedMode,
  detectedKey,
  detectedMode,
}: {
  expectedKey: string;
  expectedMode: string;
  detectedKey: string | null;
  detectedMode: string | null;
}) {
  const expected = normalizeKeyName(expectedKey);
  const detected = normalizeKeyName(detectedKey);

  if (!expected || !detected || !expectedMode || !detectedMode) {
    return "unknown";
  }

  const expectedIndex = SHARP_NOTES.indexOf(expected);
  const detectedIndex = SHARP_NOTES.indexOf(detected);
  const semitoneDistance = Math.min(
    Math.abs(expectedIndex - detectedIndex),
    12 - Math.abs(expectedIndex - detectedIndex),
  );

  if (expected === detected && expectedMode.toLowerCase() === detectedMode.toLowerCase()) {
    return "exact";
  }
  if (expected === detected) {
    return "enharmonic/root match";
  }
  if (semitoneDistance === 3 || semitoneDistance === 4) {
    return "relative major/minor";
  }
  if (circleOfFifthsDistance(expectedIndex, detectedIndex) <= 1 || semitoneDistance === 7 || semitoneDistance === 5) {
    return "perfect fifth relation";
  }

  return "different";
}

async function main() {
  const beats = await prisma.rapBeat.findMany({
    select: {
      fileName: true,
      detectedBpm: true,
      bpmConfidence: true,
      detectedKey: true,
      detectedMode: true,
      keyConfidence: true,
      keyCertainty: true,
      analysisStatus: true,
      analysisSource: true,
      bpmCandidatesJson: true,
      keyCandidatesJson: true,
    },
  });
  const rows = EXPECTED.map((expected) => {
    const beat =
      beats.find((item) => item.fileName === expected.file || item.fileName === expected.stem) ??
      beats.find((item) => item.fileName.toLowerCase().includes(expected.stem.toLowerCase()));
    const bpmDiff =
      beat?.detectedBpm !== null && beat?.detectedBpm !== undefined
        ? getTempoClassDiff(beat.detectedBpm, expected.expectedBpm)
        : null;
    const ok = keyOk({
      expectedKey: expected.expectedKey,
      expectedMode: expected.expectedMode,
      detectedKey: beat?.detectedKey ?? null,
      detectedMode: beat?.detectedMode ?? null,
    });
    const bpmCandidates = beat?.bpmCandidatesJson
      ? (JSON.parse(beat.bpmCandidatesJson) as Array<{ bpm?: number; normalizedBpm?: number; arrangementGridScore?: number }>)
      : [];
    const arrangementScore = bpmCandidates.reduce(
      (best, candidate) => Math.max(best, candidate.arrangementGridScore ?? 0),
      0,
    );
    const expectedInCandidates = bpmCandidates.some((candidate) => {
      const values = [candidate.bpm, candidate.normalizedBpm].filter(
        (value): value is number => typeof value === "number",
      );
      return values.some((value) => {
        const diff = getTempoClassDiff(value, expected.expectedBpm);
        return diff !== null && diff <= 3;
      });
    });
    const keyCandidates = beat?.keyCandidatesJson
      ? (JSON.parse(beat.keyCandidatesJson) as Array<{ key?: string; mode?: string }>)
      : [];
    const expectedKeyInCandidates = keyCandidates.some((candidate) => {
      const candidateKey = normalizeKeyName(candidate.key);
      return (
        candidateKey === normalizeKeyName(expected.expectedKey) &&
        candidate.mode?.toLowerCase() === expected.expectedMode
      );
    });
    const selectionFailed =
      expectedInCandidates && bpmDiff !== null && bpmDiff > 3;
    const keySelectionFailed = expectedKeyInCandidates && !ok;
    const notes = [
      beat?.analysisStatus ?? "missing",
      beat?.analysisSource ?? "none",
      (beat?.bpmConfidence ?? 0) < 0.65 ? "low bpm confidence" : "",
      beat?.detectedKey && (beat.keyConfidence ?? 0) < 0.45
        ? "low key confidence"
        : "",
    ]
      .filter(Boolean)
      .join(", ");

    return {
      file: expected.file,
      expectedBpm: expected.expectedBpm,
      detectedBpm: beat?.detectedBpm ?? null,
      bpmDiff: bpmDiff === null ? null : Math.round(bpmDiff * 100) / 100,
      expectedKey: `${expected.expectedKey} ${expected.expectedMode}`,
      detectedKey: beat?.detectedKey
        ? `${beat.detectedKey} ${beat.detectedMode ?? ""}`.trim()
        : null,
      keyOk: ok ? "yes" : "no",
      keyRelationship: keyRelationship({
        expectedKey: expected.expectedKey,
        expectedMode: expected.expectedMode,
        detectedKey: beat?.detectedKey ?? null,
        detectedMode: beat?.detectedMode ?? null,
      }),
      keyCertainty: beat?.keyCertainty ?? "UNKNOWN",
      arrangementScore: Math.round(arrangementScore * 1000) / 1000,
      confidence: `bpm=${beat?.bpmConfidence ?? 0} key=${beat?.keyConfidence ?? 0}`,
      notes,
      candidateBpm: bpmCandidates
        .slice(0, 5)
        .map((candidate) => candidate.normalizedBpm ?? candidate.bpm)
        .filter((value) => value !== undefined)
        .join(", "),
      bpmCandidateNote: selectionFailed
        ? "selection logic failed"
        : expectedInCandidates
          ? "expected exists in candidates"
          : "expected not found",
      keyCandidateNote: keySelectionFailed
        ? "selection logic failed"
        : expectedKeyInCandidates
          ? "expected exists in candidates"
          : "expected not found",
    };
  });

  console.table(
    rows.map((row) => ({
      file: row.file,
      expectedBpm: row.expectedBpm,
      detectedBpm: format(row.detectedBpm),
      bpmDiff: format(row.bpmDiff),
      expectedKey: row.expectedKey,
      detectedKey: format(row.detectedKey),
      keyCertainty: row.keyCertainty,
      arrangementScore: row.arrangementScore,
      keyOk: row.keyOk,
      keyRelationship: row.keyRelationship,
      confidence: row.confidence,
      candidateBpm: row.candidateBpm,
      bpmCandidateNote: row.bpmCandidateNote,
      keyCandidateNote: row.keyCandidateNote,
      notes: row.notes,
    })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
