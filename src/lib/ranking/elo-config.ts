export const STARTING_ELO = 500;
export const GRAMMY_WINNER_THRESHOLD = 2500;

export type RankName =
  | "Bedroom III"
  | "Bedroom II"
  | "Bedroom I"
  | "Tin Foil III"
  | "Tin Foil II"
  | "Tin Foil I"
  | "Bronze III"
  | "Bronze II"
  | "Bronze I"
  | "Silver III"
  | "Silver II"
  | "Silver I"
  | "Gold III"
  | "Gold II"
  | "Gold I"
  | "Platinum III"
  | "Platinum II"
  | "Platinum I"
  | "Grammy Winner";

export type RankDefinition = {
  name: RankName;
  minElo: number;
  maxElo: number | null;
};

export type RankProgress = {
  currentElo: number;
  rank: RankDefinition;
  nextRank: RankDefinition | null;
  rankMinElo: number;
  rankMaxElo: number | null;
  progressPercent: number;
};

export const rankLadder = [
  { name: "Bedroom III", minElo: 0, maxElo: 139 },
  { name: "Bedroom II", minElo: 140, maxElo: 279 },
  { name: "Bedroom I", minElo: 280, maxElo: 419 },
  { name: "Tin Foil III", minElo: 420, maxElo: 559 },
  { name: "Tin Foil II", minElo: 560, maxElo: 699 },
  { name: "Tin Foil I", minElo: 700, maxElo: 839 },
  { name: "Bronze III", minElo: 840, maxElo: 979 },
  { name: "Bronze II", minElo: 980, maxElo: 1119 },
  { name: "Bronze I", minElo: 1120, maxElo: 1259 },
  { name: "Silver III", minElo: 1260, maxElo: 1399 },
  { name: "Silver II", minElo: 1400, maxElo: 1539 },
  { name: "Silver I", minElo: 1540, maxElo: 1679 },
  { name: "Gold III", minElo: 1680, maxElo: 1819 },
  { name: "Gold II", minElo: 1820, maxElo: 1959 },
  { name: "Gold I", minElo: 1960, maxElo: 2099 },
  { name: "Platinum III", minElo: 2100, maxElo: 2239 },
  { name: "Platinum II", minElo: 2240, maxElo: 2379 },
  { name: "Platinum I", minElo: 2380, maxElo: 2499 },
  { name: "Grammy Winner", minElo: 2500, maxElo: null },
] satisfies RankDefinition[];

function normalizeElo(elo: number) {
  if (!Number.isFinite(elo)) {
    return 0;
  }

  return Math.max(0, Math.floor(elo));
}

export function getRankFromElo(elo: number): RankDefinition {
  const normalizedElo = normalizeElo(elo);

  return (
    rankLadder.find(
      (rank) =>
        normalizedElo >= rank.minElo &&
        (rank.maxElo === null || normalizedElo <= rank.maxElo),
    ) ?? rankLadder[0]
  );
}

export function getRapRankName(rankName: RankName) {
  if (rankName === "Grammy Winner") {
    return rankName;
  }

  return `${rankName.replace(/ (III|II|I)$/, "")} MC${rankName.match(/ (III|II|I)$/)?.[0] ?? ""}`;
}

export function getProducerRankName(rankName: RankName) {
  if (rankName === "Grammy Winner") {
    return rankName;
  }

  return `${rankName.replace(/ (III|II|I)$/, "")} Producer${rankName.match(/ (III|II|I)$/)?.[0] ?? ""}`;
}

export function getNextRank(elo: number): RankDefinition | null {
  const currentRank = getRankFromElo(elo);
  const currentRankIndex = rankLadder.findIndex(
    (rank) => rank.name === currentRank.name,
  );

  return rankLadder[currentRankIndex + 1] ?? null;
}

export function getRankProgress(elo: number): RankProgress {
  const currentElo = normalizeElo(elo);
  const rank = getRankFromElo(currentElo);
  const nextRank = getNextRank(currentElo);

  if (rank.maxElo === null) {
    return {
      currentElo,
      rank,
      nextRank,
      rankMinElo: rank.minElo,
      rankMaxElo: null,
      progressPercent: 100,
    };
  }

  const rankRange = rank.maxElo - rank.minElo + 1;
  const earnedInRank = currentElo - rank.minElo;

  return {
    currentElo,
    rank,
    nextRank,
    rankMinElo: rank.minElo,
    rankMaxElo: rank.maxElo,
    progressPercent: Math.min(
      100,
      Math.max(0, (earnedInRank / rankRange) * 100),
    ),
  };
}

export function getEloMultiplier(elo: number) {
  const normalizedElo = normalizeElo(elo);

  if (normalizedElo < 1000) {
    return 1.2;
  }

  if (normalizedElo < 1500) {
    return 1.0;
  }

  if (normalizedElo < 2000) {
    return 0.8;
  }

  if (normalizedElo < 2300) {
    return 0.6;
  }

  if (normalizedElo < GRAMMY_WINNER_THRESHOLD) {
    return 0.4;
  }

  return 0.2;
}
