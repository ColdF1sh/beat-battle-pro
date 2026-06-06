import {
  getEloMultiplier,
  getRankFromElo,
  type RankDefinition,
} from "@/lib/ranking/elo-config";

export type BattleEloParticipant = {
  userId: string;
  eloRating: number;
  totalVotePoints: number;
};

export type BattleEloResult = {
  userId: string;
  oldElo: number;
  newElo: number;
  eloChange: number;
  placement: number;
  totalVotePoints: number;
  rankBefore: RankDefinition;
  rankAfter: RankDefinition;
};

const MINIMUM_ELO = 0;
const normalPlacementBaseChanges = [30, 18, 5, -18, -30] as const;
const bulletPlacementBaseChanges = [21, 13, 5, -13, -21] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isBulletMode(modeId?: string | null) {
  return modeId === "beatmaking_bullet";
}

function getBaseChangeForPlacement(placement: number, modeId?: string | null) {
  const placementBaseChanges = isBulletMode(modeId)
    ? bulletPlacementBaseChanges
    : normalPlacementBaseChanges;

  return placementBaseChanges[placement - 1] ?? placementBaseChanges[4];
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getSharedPlacementBaseChange(
  startPlacement: number,
  groupSize: number,
  modeId?: string | null,
) {
  const placementChanges = Array.from({ length: groupSize }, (_, index) =>
    getBaseChangeForPlacement(startPlacement + index, modeId),
  );

  return average(placementChanges);
}

function getAverageOpponentElo(
  participant: BattleEloParticipant,
  participants: BattleEloParticipant[],
) {
  const opponents = participants.filter(
    (opponent) => opponent.userId !== participant.userId,
  );

  if (opponents.length === 0) {
    return participant.eloRating;
  }

  return average(opponents.map((opponent) => opponent.eloRating));
}

function getOpponentModifier(
  participant: BattleEloParticipant,
  participants: BattleEloParticipant[],
) {
  const averageOpponentElo = getAverageOpponentElo(participant, participants);
  const eloDiff = averageOpponentElo - participant.eloRating;

  return clamp(eloDiff / 100, -3, 3);
}

function getPlacementClamp(placement: number, modeId?: string | null) {
  if (isBulletMode(modeId)) {
    if (placement === 1) return { min: 18, max: 24 };
    if (placement === 2) return { min: 10, max: 16 };
    if (placement === 4) return { min: -16, max: -10 };
    if (placement >= 5) return { min: -24, max: -18 };
    return null;
  }

  if (placement === 1) return { min: 27, max: 33 };
  if (placement === 2) return { min: 15, max: 21 };
  if (placement === 4) return { min: -21, max: -15 };
  if (placement >= 5) return { min: -33, max: -27 };
  return null;
}

export function calculateBattleEloResults(
  participants: BattleEloParticipant[],
  options: { modeId?: string | null } = {},
): BattleEloResult[] {
  const sortedParticipants = [...participants].sort((left, right) => {
    if (right.totalVotePoints !== left.totalVotePoints) {
      return right.totalVotePoints - left.totalVotePoints;
    }

    return left.userId.localeCompare(right.userId);
  });

  const results: BattleEloResult[] = [];
  let currentIndex = 0;

  while (currentIndex < sortedParticipants.length) {
    const tiedParticipants = sortedParticipants.filter(
      (participant) =>
        participant.totalVotePoints ===
        sortedParticipants[currentIndex].totalVotePoints,
    );
    const placement = currentIndex + 1;

    // Tied players share the average of all base placement rewards in their group.
    const sharedBaseChange = getSharedPlacementBaseChange(
      placement,
      tiedParticipants.length,
      options.modeId,
    );

    for (const participant of tiedParticipants) {
      const oldElo = Math.max(MINIMUM_ELO, Math.floor(participant.eloRating));
      const isSoloThirdPlace = placement === 3 && tiedParticipants.length === 1;
      const opponentModifier = isSoloThirdPlace
        ? 0
        : getOpponentModifier(participant, participants);
      const rawBaseChange = isSoloThirdPlace
        ? sharedBaseChange * getEloMultiplier(oldElo)
        : sharedBaseChange + opponentModifier;
      const placementClamp = isSoloThirdPlace
        ? null
        : getPlacementClamp(placement, options.modeId);
      const scaledChange = Math.round(
        placementClamp
          ? clamp(rawBaseChange, placementClamp.min, placementClamp.max)
          : rawBaseChange,
      );
      const newElo = Math.max(MINIMUM_ELO, oldElo + scaledChange);

      results.push({
        userId: participant.userId,
        oldElo,
        newElo,
        eloChange: newElo - oldElo,
        placement,
        totalVotePoints: participant.totalVotePoints,
        rankBefore: getRankFromElo(oldElo),
        rankAfter: getRankFromElo(newElo),
      });
    }

    currentIndex += tiedParticipants.length;
  }

  return results.sort((left, right) => {
    if (left.placement !== right.placement) {
      return left.placement - right.placement;
    }

    return right.totalVotePoints - left.totalVotePoints;
  });
}
