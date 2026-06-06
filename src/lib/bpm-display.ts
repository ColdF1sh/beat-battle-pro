export type BpmCandidate = {
  bpm: number;
  score?: number;
};

export type NormalizedBpmCandidate = {
  bpm: number;
  sourceBpm: number;
  score: number;
  rawScore: number;
  bandWeight: number;
  sourceRank: number;
  labels: string[];
};

export type DisplayBpmChoice = {
  bpm: number | null;
  normalizedCandidates: Array<
    {
      bpm: number;
      score: number;
      sources: NormalizedBpmCandidate[];
      labels: string[];
    }
  >;
  reason: string;
};

type BpmCluster = {
  bpm: number;
  score: number;
  sources: NormalizedBpmCandidate[];
  labels: string[];
};

function roundTempo(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeDisplayTempoCandidates(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    return [];
  }

  const variants = [
    { bpm, label: "raw" },
    { bpm: bpm * 2, label: "double" },
    { bpm: bpm / 2, label: "half" },
    { bpm: bpm * 1.5, label: "preferredRapTempo" },
    { bpm: bpm / 1.5, label: "tripletPulse" },
  ];
  const seen = new Set<number>();

  return variants
    .filter((candidate) => candidate.bpm >= 60 && candidate.bpm <= 190)
    .map((candidate) => ({ ...candidate, bpm: roundTempo(candidate.bpm) }))
    .filter((candidate) => {
      if (seen.has(candidate.bpm)) {
        return false;
      }
      seen.add(candidate.bpm);
      return true;
    });
}

function rapBpmBandWeight(candidate: number, sourceBpm: number) {
  let weight = 1;

  if (candidate >= 80 && candidate <= 100) {
    weight *= 1.18;
  } else if (candidate >= 135 && candidate <= 170) {
    weight *= 1.34;
  } else if (candidate >= 120 && candidate < 135) {
    weight *= 0.82;
  } else if (candidate > 175) {
    weight *= 0.82;
  }

  if (sourceBpm >= 70 && sourceBpm <= 75 && candidate >= 140 && candidate <= 150) {
    weight *= 1.22;
  }

  if (sourceBpm >= 85 && sourceBpm <= 95 && candidate >= 125 && candidate <= 140) {
    weight *= 0.62;
  }

  return weight;
}

function isTripletRelation(lowBpm: number, highBpm: number) {
  return (
    lowBpm >= 90 &&
    lowBpm <= 115 &&
    highBpm >= 135 &&
    highBpm <= 170 &&
    Math.abs(lowBpm * 1.5 - highBpm) <= 3
  );
}

function addLabel(candidate: { labels: string[] }, label: string) {
  if (!candidate.labels.includes(label)) {
    candidate.labels.push(label);
  }
}

function polishDisplayBpm(bpm: number) {
  if (bpm >= 88.5 && bpm <= 91.5) {
    return 90;
  }

  if (bpm >= 116 && bpm <= 121.5) {
    return 120;
  }

  if (bpm > 121.5 && bpm <= 126.5) {
    return 125;
  }

  if (bpm >= 157.5 && bpm <= 162.5) {
    return 160;
  }

  return Math.round(bpm);
}

export function chooseDisplayBpm(candidates: BpmCandidate[]): DisplayBpmChoice {
  const normalized = candidates.flatMap((candidate, index) => {
    if (!Number.isFinite(candidate.bpm) || candidate.bpm <= 0) {
      return [];
    }

    const rawScore = candidate.score ?? 1;

    return normalizeDisplayTempoCandidates(candidate.bpm).map((variant) => {
      const bpm = variant.bpm;
      const bandWeight = rapBpmBandWeight(bpm, candidate.bpm);

      return {
        bpm,
        sourceBpm: roundTempo(candidate.bpm),
        score: roundTempo(rawScore * bandWeight),
        rawScore: roundTempo(rawScore),
        bandWeight: roundTempo(bandWeight),
        sourceRank: index + 1,
        labels: [variant.label],
      };
    });
  });

  if (normalized.length === 0) {
    return {
      bpm: null,
      normalizedCandidates: [],
      reason: "no candidates",
    };
  }

  for (const candidate of normalized) {
    if (candidate.bpm >= 135 && candidate.bpm <= 170) {
      addLabel(candidate, "preferredRapTempo");
    }
  }

  for (const low of normalized) {
    if (low.bpm < 90 || low.bpm > 115) {
      continue;
    }
    const relatedHigh = normalized.filter((high) =>
      isTripletRelation(low.bpm, high.bpm),
    );
    if (relatedHigh.length === 0) {
      continue;
    }
    addLabel(low, "tripletPulse");
    low.score = roundTempo(low.score * 0.68);
    for (const high of relatedHigh) {
      addLabel(high, "preferredRapTempo");
      addLabel(high, "trapDrillDoubleTime");
      high.score = roundTempo(high.score * 1.18);
    }
  }

  const buckets: BpmCluster[] = [];

  for (const candidate of normalized.sort((left, right) => right.score - left.score)) {
    let bucket = buckets.find((item) => Math.abs(item.bpm - candidate.bpm) <= 3);

    if (!bucket) {
      bucket = {
        bpm: candidate.bpm,
        score: 0,
        sources: [],
        labels: [],
      };
      buckets.push(bucket);
    }

    bucket.score += candidate.score;
    bucket.sources.push(candidate);
    for (const label of candidate.labels) {
      addLabel(bucket, label);
    }
    bucket.bpm =
      bucket.sources.reduce((sum, item) => sum + item.bpm * item.score, 0) /
      Math.max(bucket.score, 1e-9);
  }

  const normalizedCandidates = buckets
    .map((candidate) => ({
      ...candidate,
      score: roundTempo(candidate.score),
    }))
    .sort((left, right) => right.score - left.score);
  const chosen = chooseMusicalCluster(normalizedCandidates);

  return {
    bpm: chosen ? polishDisplayBpm(chosen.bpm) : null,
    normalizedCandidates: normalizedCandidates.slice(0, 10),
    reason: chosen
      ? `preferred rap display band for ${polishDisplayBpm(chosen.bpm)} BPM`
      : "no candidates",
  };
}

function clusterInRange(
  cluster: { bpm: number },
  low: number,
  high: number,
) {
  return cluster.bpm >= low && cluster.bpm <= high;
}

function clusterHasSource(
  cluster: { sources: NormalizedBpmCandidate[] },
  low: number,
  high: number,
) {
  return cluster.sources.some(
    (source) => source.sourceBpm >= low && source.sourceBpm <= high,
  );
}

function clusterDirectRawScore(
  cluster: { sources: NormalizedBpmCandidate[] },
  low: number,
  high: number,
) {
  return Math.max(
    0,
    ...cluster.sources
      .filter(
        (source) =>
          source.sourceBpm >= low &&
          source.sourceBpm <= high &&
          source.labels.includes("raw"),
      )
      .map((source) => source.rawScore),
  );
}

function chooseMusicalCluster(
  ranked: BpmCluster[],
) {
  const best = ranked[0];

  if (!best) {
    return undefined;
  }

  const bestScore = Math.max(best.score, 1e-9);
  const strongest = (low: number, high: number) =>
    ranked.find((candidate) => clusterInRange(candidate, low, high));

  if (clusterInRange(best, 70, 76)) {
    const mid = strongest(105, 115);

    if (mid && mid.score >= bestScore * 0.75) {
      return mid;
    }

    const double = strongest(138, 150);

    if (double && double.score >= bestScore * 0.7) {
      return double;
    }
  }

  if (clusterInRange(best, 78, 100)) {
    const double = strongest(138, 150);

    if (
      double &&
      double.score >= bestScore * 0.8 &&
      (clusterHasSource(double, 70, 75) || clusterHasSource(double, 138, 150))
    ) {
      return double;
    }

    const tactical = strongest(116, 126.5);

    if (
      tactical &&
      tactical.score >= bestScore * 0.84 &&
      clusterHasSource(tactical, 116, 126.5)
    ) {
      return tactical;
    }
  }

  if (clusterInRange(best, 90, 115) && best.labels.includes("tripletPulse")) {
    const rapTempo = strongest(135, 170);

    if (rapTempo && rapTempo.score >= bestScore * 0.55) {
      return rapTempo;
    }
  }

  if (clusterInRange(best, 105, 115)) {
    const doubleTime = strongest(157, 163);

    if (
      doubleTime &&
      doubleTime.score >= bestScore * 0.78 &&
      clusterHasSource(doubleTime, 157, 163)
    ) {
      return doubleTime;
    }
  }

  if (clusterInRange(best, 157, 170)) {
    const mid = strongest(105, 115);

    if (mid) {
      const bestRaw = clusterDirectRawScore(best, 157, 170);
      const midRaw = clusterDirectRawScore(mid, 105, 115);

      if (midRaw > 0 && bestRaw > 0 && midRaw >= bestRaw * 0.82) {
        return mid;
      }
    }
  }

  return best;
}
