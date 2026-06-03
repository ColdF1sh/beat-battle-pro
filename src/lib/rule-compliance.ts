export const SHARP_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export type SharpNote = (typeof SHARP_NOTES)[number];

const FLAT_TO_SHARP: Record<string, SharpNote> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

export type AudioRuleAnalysis = {
  bpm: number | null;
  bpmConfidence: number;
  key: string | null;
  mode: "major" | "minor" | null;
  keyConfidence: number;
  keyCertainty?: "DETECTED" | "POSSIBLE" | "UNKNOWN" | null;
  tuningCents?: number | null;
};

export type RuleCompliancePenalty = {
  bpmPenalty: number;
  keyPenalty: number;
  totalPenalty: number;
  bpmDiff: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeTempoCandidates(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    return [];
  }

  return Array.from(
    new Set(
      [bpm, bpm * 2, bpm / 2]
        .filter((candidate) => candidate >= 45 && candidate <= 220)
        .map((candidate) => Math.round(candidate * 100) / 100),
    ),
  );
}

export function getTempoClassDiff(detectedBpm: number, targetBpm: number) {
  const detectedCandidates = normalizeTempoCandidates(detectedBpm);
  const targetCandidates = normalizeTempoCandidates(targetBpm);
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const detected of detectedCandidates) {
    for (const target of targetCandidates) {
      bestDiff = Math.min(bestDiff, Math.abs(detected - target));
    }
  }

  return Number.isFinite(bestDiff) ? bestDiff : null;
}

export function normalizeKeyName(key: string | null | undefined): SharpNote | null {
  if (!key) {
    return null;
  }

  const cleaned = key.trim().replace(/\s*(major|minor)$/i, "");

  if (SHARP_NOTES.includes(cleaned as SharpNote)) {
    return cleaned as SharpNote;
  }

  return FLAT_TO_SHARP[cleaned] ?? null;
}

export function calculateBpmPenalty({
  detectedBpm,
  targetBpm,
  confidence,
}: {
  detectedBpm: number | null;
  targetBpm: number | null;
  confidence: number;
}) {
  if (detectedBpm === null || targetBpm === null) {
    return { penalty: 0, diff: null };
  }

  const diff = getTempoClassDiff(detectedBpm, targetBpm);

  if (diff === null) {
    return { penalty: 0, diff: null };
  }

  let penalty = 1;

  if (diff <= 2) {
    penalty = 0;
  } else if (diff <= 5) {
    penalty = 0.15;
  } else if (diff <= 10) {
    penalty = 0.75;
  }

  const confidenceMultiplier =
    confidence >= 0.85 ? 1 : confidence >= 0.65 ? 0.85 : confidence >= 0.45 ? 0.55 : 0.2;

  return {
    penalty: clamp(penalty * confidenceMultiplier, 0, 1),
    diff,
  };
}

function circleOfFifthsDistance(leftIndex: number, rightIndex: number) {
  const leftPosition = (leftIndex * 7) % 12;
  const rightPosition = (rightIndex * 7) % 12;
  const distance = Math.abs(leftPosition - rightPosition);

  return Math.min(distance, 12 - distance);
}

export function calculateKeyPenalty({
  detectedKey,
  targetKey,
  detectedMode,
  targetMode,
  confidence,
}: {
  detectedKey: string | null;
  targetKey: string | null;
  detectedMode?: "major" | "minor" | null;
  targetMode?: "major" | "minor" | null;
  confidence: number;
}) {
  const detected = normalizeKeyName(detectedKey);
  const target = normalizeKeyName(targetKey);

  if (!detected || !target) {
    return 0;
  }
  if (confidence <= 0) {
    return 0;
  }

  const detectedIndex = SHARP_NOTES.indexOf(detected);
  const targetIndex = SHARP_NOTES.indexOf(target);
  const semitoneDistance = Math.min(
    Math.abs(detectedIndex - targetIndex),
    12 - Math.abs(detectedIndex - targetIndex),
  );
  const fifthsDistance = circleOfFifthsDistance(detectedIndex, targetIndex);
  let penalty = 1;

  if (semitoneDistance === 0) {
    penalty = targetMode && detectedMode && targetMode !== detectedMode ? 0.15 : 0;
  } else if (semitoneDistance === 3 || semitoneDistance === 4) {
    penalty = 0.2;
  } else if (fifthsDistance <= 1 || semitoneDistance === 5 || semitoneDistance === 7) {
    penalty = 0.25;
  } else if (semitoneDistance === 1 || semitoneDistance === 11) {
    penalty = 0.55;
  } else {
    penalty = 0.7;
  }

  const confidenceMultiplier =
    confidence >= 0.85 ? 0.85 : confidence >= 0.65 ? 0.65 : confidence >= 0.45 ? 0.35 : 0.1;

  return clamp(penalty * confidenceMultiplier, 0, 1);
}

export function calculateRuleCompliancePenalty({
  analysis,
  targetBpm,
  targetKey,
  targetMode,
}: {
  analysis: AudioRuleAnalysis | null;
  targetBpm: number | null;
  targetKey: string | null;
  targetMode?: "major" | "minor" | null;
}): RuleCompliancePenalty {
  if (!analysis) {
    return {
      bpmPenalty: 0,
      keyPenalty: 0,
      totalPenalty: 0,
      bpmDiff: null,
    };
  }

  const bpmResult = calculateBpmPenalty({
    detectedBpm: analysis.bpm,
    targetBpm,
    confidence: analysis.bpmConfidence,
  });
  const keyPenalty = calculateKeyPenalty({
    detectedKey: analysis.key,
    detectedMode: analysis.mode,
    targetKey,
    targetMode,
    confidence:
      analysis.keyCertainty === "POSSIBLE"
        ? Math.min(analysis.keyConfidence, 0.34)
        : analysis.keyCertainty === "UNKNOWN"
          ? 0
          : analysis.keyConfidence,
  });

  return {
    bpmPenalty: bpmResult.penalty,
    keyPenalty,
    totalPenalty: clamp(bpmResult.penalty + keyPenalty, 0, 2),
    bpmDiff: bpmResult.diff,
  };
}

export function applyRulePenalty(averageScore: number, penalty: number) {
  return clamp(averageScore - clamp(penalty, 0, 2), 0, 10);
}
