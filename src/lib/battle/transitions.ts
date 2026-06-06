import { BattleStatus } from "@prisma/client";

import { analyzeAndCacheBattleSubmission } from "@/lib/audio-analysis";
import { isBattleDevToolsEnabled } from "@/lib/battle/dev-tools";
import { prisma } from "@/lib/prisma";
import { modeRequiresDrafting } from "@/lib/battle/drafting/engine";
import {
  ensureBattleAudioSource,
  isRapBattleMode,
  queueRapBeatAnalysisForBattle,
  selectPreparedRapBeatForBattle,
} from "@/lib/battle/sound-pack";
import {
  calculateBattleEloResults,
  type BattleEloResult as CalculatedBattleEloResult,
} from "@/lib/ranking/calculate-battle-elo";
import { getEloMultiplier } from "@/lib/ranking/elo-config";
import {
  applyRulePenalty,
  calculateRuleCompliancePenalty,
} from "@/lib/rule-compliance";
import { scanGlobalLocalLibrary } from "@/lib/sound-library/local-library";

type RankedParticipant = {
  participantId: string;
  userId: string;
  username: string;
  points: number;
  voteCount: number;
  averageScore: number;
  adjustedAverageScore: number;
  rulePenalty: number;
  tenCount: number;
  firstSubmissionAt: Date | null;
  hasSubmission: boolean;
  missedSubmission: boolean;
  technicalLoss: boolean;
  forfeited: boolean;
};

type PersistedBattleEloResult = {
  userId: string;
  oldElo: number;
  newElo: number;
  eloChange: number;
  placement: number;
  totalVotePoints: number;
};

export type FinishBattleResult = {
  battleId: string;
  status: BattleStatus;
  isTie: boolean;
  winnerId: string | null;
  rankings: RankedParticipant[];
  eloResults?: Array<CalculatedBattleEloResult | PersistedBattleEloResult>;
};

export const READY_CHECK_DURATION_MS = 25 * 1000;
export const VOTING_DURATION_SECONDS = 25;
const QUALIFICATION_BASE_ELO = 350;
const QUALIFICATION_ELO_SPREAD = 400;

type BattleRatingCategory = "producer" | "rap";

function getBattleRatingCategory(mode: string): BattleRatingCategory {
  return mode.startsWith("rap_") ? "rap" : "producer";
}

export function getQualificationElo({
  points,
  maxPoints,
  placement,
  playerCount,
  technicalLoss,
}: {
  points: number;
  maxPoints: number;
  placement: number;
  playerCount: number;
  technicalLoss: boolean;
}) {
  if (technicalLoss) {
    return QUALIFICATION_BASE_ELO;
  }

  const scoreRatio =
    maxPoints > 0 ? Math.max(0, Math.min(1, points / maxPoints)) : 0.375;
  const placementRatio =
    playerCount > 1
      ? Math.max(0, Math.min(1, (playerCount - placement) / (playerCount - 1)))
      : 1;
  const performanceRatio = scoreRatio * 0.7 + placementRatio * 0.3;

  return Math.round(
    QUALIFICATION_BASE_ELO + QUALIFICATION_ELO_SPREAD * performanceRatio,
  );
}

function getCategoryStats(user: {
  eloRating: number;
  producerElo: number | null;
  producerWins: number;
  producerGames: number;
  rapElo: number | null;
  rapWins: number;
  rapGames: number;
}, category: BattleRatingCategory) {
  if (category === "rap") {
    return {
      elo: user.rapElo,
      wins: user.rapWins,
      games: user.rapGames,
      eloField: "rapElo" as const,
      winsField: "rapWins" as const,
      gamesField: "rapGames" as const,
    };
  }

  return {
    elo: user.producerElo,
    wins: user.producerWins,
    games: user.producerGames,
    eloField: "producerElo" as const,
    winsField: "producerWins" as const,
    gamesField: "producerGames" as const,
  };
}

function getReadyDeadline(now = new Date()) {
  return {
    readyStartedAt: now,
    readyEndsAt: new Date(now.getTime() + READY_CHECK_DURATION_MS),
  };
}

export function getReadyCheckDeadline(now = new Date()) {
  return getReadyDeadline(now);
}

function isDevFakePlayerEnabled() {
  return isBattleDevToolsEnabled();
}

function pickDevFakeSubmissionSound(index: number) {
  const librarySounds = scanGlobalLocalLibrary();
  const loopSounds = librarySounds.filter((sound) => sound.category === "LOOP");
  const sourceSounds = loopSounds.length > 0 ? loopSounds : librarySounds;

  return sourceSounds[index % Math.max(1, sourceSounds.length)] ?? null;
}

export async function seedDevFakeSubmissionsForBattle(battleId: string) {
  if (!isDevFakePlayerEnabled()) {
    return {
      created: 0,
      updated: 0,
    };
  }

  const fakeParticipants = await prisma.battleParticipant.findMany({
    where: {
      battleId,
      user: {
        username: {
          startsWith: "dev_fake_player_",
        },
      },
    },
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
    orderBy: {
      joinedAt: "asc",
    },
  });

  if (fakeParticipants.length === 0) {
    return {
      created: 0,
      updated: 0,
    };
  }

  const now = new Date();
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const [index, participant] of fakeParticipants.entries()) {
      const sound = pickDevFakeSubmissionSound(index);

      if (!sound) {
        continue;
      }

      const existingSubmission = await tx.battleSubmission.findUnique({
        where: {
          battleId_participantId: {
            battleId,
            participantId: participant.id,
          },
        },
        select: {
          id: true,
        },
      });

      await tx.battleSubmission.upsert({
        where: {
          battleId_participantId: {
            battleId,
            participantId: participant.id,
          },
        },
        update: {
          fileUrl: sound.fileUrl,
          fileName: sound.originalFileName,
          mimeType: sound.mimeType,
          sizeBytes: sound.sizeBytes,
        },
        create: {
          battleId,
          participantId: participant.id,
          userId: participant.userId,
          fileUrl: sound.fileUrl,
          fileName: sound.originalFileName,
          mimeType: sound.mimeType,
          sizeBytes: sound.sizeBytes,
        },
      });

      await tx.battleParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          beatUrl: sound.fileUrl,
          submittedAt: now,
          missedSubmission: false,
          technicalLoss: false,
        },
      });

      if (existingSubmission) {
        updated += 1;
      } else {
        created += 1;
      }
    }
  });

  return {
    created,
    updated,
  };
}

export async function maybeCancelExpiredReadyBattle(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
      readyChecks: {
        select: {
          userId: true,
          isReady: true,
        },
      },
    },
  });

  if (!battle || battle.status !== BattleStatus.READY) {
    return battle;
  }

  if (!battle.readyEndsAt) {
    return prisma.battle.update({
      where: {
        id: battle.id,
      },
      data: getReadyDeadline(),
    });
  }

  if (Date.now() < battle.readyEndsAt.getTime()) {
    return battle;
  }

  const readyUserIds = new Set(
    battle.readyChecks
      .filter((readyCheck) => readyCheck.isReady)
      .map((readyCheck) => readyCheck.userId),
  );
  const allReady =
    battle.participants.length > 0 &&
    battle.participants.every((participant) =>
      readyUserIds.has(participant.userId),
    );

  if (allReady) {
    return battle;
  }

  return prisma.battle.update({
    where: {
      id: battle.id,
    },
    data: {
      status: BattleStatus.CANCELLED,
    },
  });
}

export async function maybeStartReadyBattle(battleId: string) {
  const readyBattle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      mode: true,
    },
  });
  const selectedRapBeat =
    readyBattle && isRapBattleMode(readyBattle.mode)
      ? await selectPreparedRapBeatForBattle(
          `${readyBattle.id}:${readyBattle.mode}`,
        )
      : null;

  const updatedBattle = await prisma.$transaction(async (tx) => {
    const battle = await tx.battle.findUnique({
      where: {
        id: battleId,
      },
      include: {
        participants: {
          select: {
            userId: true,
            forfeited: true,
          },
        },
        readyChecks: {
          select: {
            userId: true,
            isReady: true,
          },
        },
      },
    });

    if (!battle || battle.status !== BattleStatus.READY) {
      return battle;
    }

    if (battle.readyEndsAt && Date.now() >= battle.readyEndsAt.getTime()) {
      return tx.battle.update({
        where: {
          id: battle.id,
        },
        data: {
          status: BattleStatus.CANCELLED,
        },
      });
    }

    const activeParticipants = battle.participants.filter(
      (participant) => !participant.forfeited,
    );
    const readyUserIds = new Set(
      battle.readyChecks
        .filter((readyCheck) => readyCheck.isReady)
        .map((readyCheck) => readyCheck.userId),
    );
    const allReady =
      activeParticipants.length > 0 &&
      activeParticipants.every((participant) =>
        readyUserIds.has(participant.userId),
      );

    if (!allReady) {
      return battle;
    }

    if (modeRequiresDrafting(battle.mode)) {
      if (isRapBattleMode(battle.mode)) {
        await ensureBattleAudioSource(tx, {
          battleId: battle.id,
          modeId: battle.mode,
          selectedRapBeat,
          allowRapBeatFilesystemScan: false,
        });
      }

      const updatedBattle = await tx.battle.update({
        where: {
          id: battle.id,
        },
        data: {
          status: BattleStatus.DRAFTING,
        },
      });

      await tx.battleDraft.upsert({
        where: {
          battleId: battle.id,
        },
        update: {},
        create: {
          battleId: battle.id,
        },
      });

      return updatedBattle;
    }

    const now = new Date();
    await ensureBattleAudioSource(tx, {
      battleId: battle.id,
      modeId: battle.mode,
      selectedRapBeat,
      allowRapBeatFilesystemScan: false,
    });

    return tx.battle.update({
      where: {
        id: battle.id,
      },
      data: {
        status: BattleStatus.ACTIVE,
        startedAt: now,
        endsAt: new Date(now.getTime() + battle.durationMinutes * 60 * 1000),
      },
    });
  });

  if (updatedBattle && isRapBattleMode(updatedBattle.mode)) {
    queueRapBeatAnalysisForBattle(updatedBattle.id);
  }

  return updatedBattle;
}

export async function maybeMoveBattleToSubmission(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      status: true,
      endsAt: true,
    },
  });

  if (!battle || battle.status !== BattleStatus.ACTIVE || !battle.endsAt) {
    return battle;
  }

  if (Date.now() < battle.endsAt.getTime()) {
    return battle;
  }

  const updatedBattle = await prisma.battle.update({
    where: {
      id: battle.id,
    },
    data: {
      status: BattleStatus.SUBMISSION,
      submissionStartedAt: new Date(),
      submissionEndsAt: new Date(Date.now() + 60 * 1000),
    },
  });

  await seedDevFakeSubmissionsForBattle(battle.id);

  return updatedBattle;
}

export async function maybeMoveBattleToVoting(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      status: true,
      submissionEndsAt: true,
      participants: {
        select: {
          id: true,
          submission: {
            select: {
              id: true,
              createdAt: true,
              detectedBpm: true,
              bpmConfidence: true,
              detectedKey: true,
              detectedMode: true,
              keyConfidence: true,
              analyzedAt: true,
            },
          },
        },
      },
      submissions: {
        select: {
          participantId: true,
        },
      },
    },
  });

  if (!battle) {
    return null;
  }

  if (battle.status !== BattleStatus.SUBMISSION) {
    return battle;
  }

  await seedDevFakeSubmissionsForBattle(battle.id);

  const currentParticipants = await prisma.battleParticipant.findMany({
    where: {
      battleId: battle.id,
    },
    select: {
      id: true,
      submission: {
        select: {
          id: true,
        },
      },
    },
  });
  const currentSubmissions = await prisma.battleSubmission.findMany({
    where: {
      battleId: battle.id,
    },
    select: {
      participantId: true,
    },
  });
  const submittedParticipantIds = new Set(
    currentSubmissions.map((submission) => submission.participantId),
  );
  const allParticipantsSubmitted =
    currentParticipants.length > 0 &&
    currentParticipants.every((participant) =>
      submittedParticipantIds.has(participant.id),
    );
  const submissionExpired = Boolean(
    battle.submissionEndsAt && Date.now() >= battle.submissionEndsAt.getTime(),
  );

  if (!allParticipantsSubmitted && !submissionExpired) {
    return battle;
  }

  if (submissionExpired) {
    await prisma.battleParticipant.updateMany({
      where: {
        battleId: battle.id,
        id: {
          in: currentParticipants
            .filter((participant) => !participant.submission)
            .map((participant) => participant.id),
        },
      },
      data: {
        missedSubmission: true,
        technicalLoss: true,
      },
    });
  }

  return prisma.battle.update({
    where: {
      id: battle.id,
    },
    data: {
      status: BattleStatus.VOTING,
      votingStartedAt: null,
      votingEndsAt: null,
    },
    include: {
      participants: {
        select: {
          id: true,
        },
      },
      submissions: {
        select: {
          participantId: true,
        },
      },
    },
  });
}

export async function maybeStartVotingTimer(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      status: true,
      votingStartedAt: true,
      listeningProgress: {
        where: {
          completed: true,
        },
        select: {
          userId: true,
        },
      },
    },
  });

  if (!battle || battle.status !== BattleStatus.VOTING || battle.votingStartedAt) {
    return battle;
  }

  if (battle.listeningProgress.length === 0) {
    return battle;
  }

  const now = new Date();

  return prisma.battle.update({
    where: {
      id: battle.id,
    },
    data: {
      votingStartedAt: now,
      votingEndsAt: new Date(now.getTime() + VOTING_DURATION_SECONDS * 1000),
    },
  });
}

function buildScoreboard(
  participants: Array<{
    id: string;
    userId: string;
    missedSubmission?: boolean;
    technicalLoss?: boolean;
    forfeited?: boolean;
    submission?: { id: string; createdAt?: Date } | null;
    user: {
      username: string;
    };
  }>,
  votes: Array<{
    participantId: string;
    score: number;
  }>,
  rulePenaltyByParticipantId = new Map<string, number>(),
) {
  const scores = new Map(participants.map((participant) => [participant.id, 0]));
  const voteCounts = new Map(participants.map((participant) => [participant.id, 0]));
  const tenCounts = new Map(participants.map((participant) => [participant.id, 0]));

  for (const vote of votes) {
    scores.set(vote.participantId, (scores.get(vote.participantId) ?? 0) + vote.score);
    voteCounts.set(vote.participantId, (voteCounts.get(vote.participantId) ?? 0) + 1);
    if (vote.score === 10) {
      tenCounts.set(vote.participantId, (tenCounts.get(vote.participantId) ?? 0) + 1);
    }
  }

  return participants
    .map((participant) => {
      const voteCount = voteCounts.get(participant.id) ?? 0;
      const rawPoints = scores.get(participant.id) ?? 0;
      const averageScore = voteCount > 0 ? rawPoints / voteCount : 0;
      const rulePenalty = rulePenaltyByParticipantId.get(participant.id) ?? 0;
      const adjustedAverageScore =
        voteCount > 0 ? applyRulePenalty(averageScore, rulePenalty) : 0;
      const adjustedPoints =
        voteCount > 0 ? Math.round(adjustedAverageScore * voteCount) : rawPoints;

      return {
        participantId: participant.id,
        userId: participant.userId,
        username: participant.user.username,
        points: adjustedPoints,
        voteCount,
        averageScore,
        adjustedAverageScore,
        rulePenalty,
        tenCount: tenCounts.get(participant.id) ?? 0,
        firstSubmissionAt: participant.submission?.createdAt ?? null,
        hasSubmission: Boolean(participant.submission),
        missedSubmission: Boolean(participant.missedSubmission),
        technicalLoss:
          Boolean(participant.technicalLoss) ||
          Boolean(participant.forfeited) ||
          !participant.submission,
        forfeited: Boolean(participant.forfeited),
      };
    })
    .sort((left, right) => {
      if (left.technicalLoss !== right.technicalLoss) {
        return left.technicalLoss ? 1 : -1;
      }

      if (right.points !== left.points) {
        return right.points - left.points;
      }

      if (right.averageScore !== left.averageScore) {
        return right.averageScore - left.averageScore;
      }

      if (right.tenCount !== left.tenCount) {
        return right.tenCount - left.tenCount;
      }

      if (left.firstSubmissionAt && right.firstSubmissionAt) {
        const submissionDelta =
          left.firstSubmissionAt.getTime() - right.firstSubmissionAt.getTime();

        if (submissionDelta !== 0) {
          return submissionDelta;
        }
      }

      return left.username.localeCompare(right.username);
    });
}

function rankingsAreStillTied(left: RankedParticipant, right: RankedParticipant) {
  const leftSubmissionTime =
    left.firstSubmissionAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightSubmissionTime =
    right.firstSubmissionAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

  return (
    left.points === right.points &&
    left.averageScore === right.averageScore &&
    left.tenCount === right.tenCount &&
    leftSubmissionTime === rightSubmissionTime
  );
}

async function buildRulePenaltyMap({
  mode,
  draft,
  participants,
}: {
  mode: string;
  draft: {
    status: string;
    finalBpm: string | null;
    finalKey: string | null;
  } | null;
  participants: Array<{
    id: string;
    submission?: {
      id: string;
      detectedBpm?: number | null;
      bpmConfidence?: number | null;
      detectedKey?: string | null;
      detectedMode?: string | null;
      keyConfidence?: number | null;
      analyzedAt?: Date | null;
    } | null;
  }>;
}) {
  if (!modeRequiresDrafting(mode) || draft?.status !== "COMPLETED") {
    return new Map<string, number>();
  }

  const targetBpm = draft.finalBpm ? Number.parseInt(draft.finalBpm, 10) : null;
  const targetKey = draft.finalKey;

  if (!targetBpm && !targetKey) {
    return new Map<string, number>();
  }

  const penalties = new Map<string, number>();

  for (const participant of participants) {
    if (!participant.submission) {
      continue;
    }

    const cachedMode: "major" | "minor" | null =
      participant.submission.detectedMode === "major" ||
      participant.submission.detectedMode === "minor"
        ? participant.submission.detectedMode
        : null;
    const cachedAnalysis = participant.submission.analyzedAt
      ? {
          bpm: participant.submission.detectedBpm ?? null,
          bpmConfidence: participant.submission.bpmConfidence ?? 0,
          key: participant.submission.detectedKey ?? null,
          mode: cachedMode,
          keyConfidence: participant.submission.keyConfidence ?? 0,
        }
      : await analyzeAndCacheBattleSubmission(prisma, participant.submission.id);

    const penalty = calculateRuleCompliancePenalty({
      analysis: cachedAnalysis,
      targetBpm,
      targetKey,
    });

    penalties.set(participant.id, penalty.totalPenalty);

    await prisma.battleSubmission.update({
      where: {
        id: participant.submission.id,
      },
      data: {
        rulePenalty: penalty.totalPenalty,
      },
    });
  }

  return penalties;
}

async function getFinishedBattleResult(
  battleId: string,
): Promise<FinishBattleResult | null> {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    include: {
      participants: {
        include: {
          submission: {
            select: {
              id: true,
              createdAt: true,
              detectedBpm: true,
              bpmConfidence: true,
              detectedKey: true,
              detectedMode: true,
              keyConfidence: true,
              analyzedAt: true,
            },
          },
          user: {
            select: {
              username: true,
            },
          },
        },
      },
      votes: {
        select: {
          participantId: true,
          score: true,
        },
      },
      eloResults: {
        select: {
          userId: true,
          oldElo: true,
          newElo: true,
          eloChange: true,
          placement: true,
          totalVotePoints: true,
        },
        orderBy: [
          {
            placement: "asc",
          },
          {
            totalVotePoints: "desc",
          },
        ],
      },
      draft: {
        select: {
          status: true,
          finalBpm: true,
          finalKey: true,
        },
      },
    },
  });

  if (!battle) {
    return null;
  }

  const rulePenaltyByParticipantId = await buildRulePenaltyMap({
    mode: battle.mode,
    draft: battle.draft,
    participants: battle.participants,
  });
  const rankings = buildScoreboard(
    battle.participants,
    battle.votes,
    rulePenaltyByParticipantId,
  );
  const validRankings = rankings.filter((ranking) => !ranking.technicalLoss);
  const winnerCandidate = validRankings[0] ?? null;
  const isCleanTie = Boolean(
    winnerCandidate &&
      validRankings
        .slice(1)
        .some((ranking) => rankingsAreStillTied(winnerCandidate, ranking)),
  );

  return {
    battleId: battle.id,
    status: battle.status,
    isTie:
      battle.status === BattleStatus.FINISHED &&
      (validRankings.length === 0 || isCleanTie),
    winnerId: battle.winnerId,
    rankings,
    eloResults: battle.eloResults,
  };
}

export async function finishBattle(
  battleId: string,
): Promise<FinishBattleResult | null> {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    include: {
      participants: {
        include: {
          submission: {
            select: {
              id: true,
              createdAt: true,
              detectedBpm: true,
              bpmConfidence: true,
              detectedKey: true,
              detectedMode: true,
              keyConfidence: true,
              analyzedAt: true,
            },
          },
          user: {
            select: {
              username: true,
              eloRating: true,
              producerElo: true,
              producerWins: true,
              producerGames: true,
              rapElo: true,
              rapWins: true,
              rapGames: true,
            },
          },
        },
      },
      votes: {
        select: {
          participantId: true,
          score: true,
        },
      },
      eloResults: {
        select: {
          userId: true,
          oldElo: true,
          newElo: true,
          eloChange: true,
          placement: true,
          totalVotePoints: true,
        },
      },
      draft: {
        select: {
          status: true,
          finalBpm: true,
          finalKey: true,
        },
      },
    },
  });

  if (!battle) {
    return null;
  }

  if (battle.status === BattleStatus.FINISHED) {
    console.warn(`Duplicate finish attempt ignored for battle ${battle.id}.`);
    return getFinishedBattleResult(battle.id);
  }

  if (battle.eloProcessed || battle.eloResults.length > 0) {
    console.warn(
      `Duplicate Elo processing attempt ignored for battle ${battle.id}.`,
    );
    return getFinishedBattleResult(battle.id);
  }

  if (battle.status !== BattleStatus.VOTING) {
    return {
      battleId: battle.id,
      status: battle.status,
      isTie: false,
      winnerId: battle.winnerId,
      rankings: buildScoreboard(battle.participants, battle.votes),
    };
  }

  const rulePenaltyByParticipantId = await buildRulePenaltyMap({
    mode: battle.mode,
    draft: battle.draft,
    participants: battle.participants,
  });
  const rankings = buildScoreboard(
    battle.participants,
    battle.votes,
    rulePenaltyByParticipantId,
  );
  const validRankings = rankings.filter((ranking) => !ranking.technicalLoss);
  const ratingCategory = getBattleRatingCategory(battle.mode);
  const noContest = validRankings.length === 0 || battle.votes.length === 0;

  if (noContest) {
    const finishedAt = new Date();
    const noContestEloResults = battle.participants.map((participant) => {
      const categoryStats = getCategoryStats(participant.user, ratingCategory);
      const currentElo = categoryStats.elo ?? participant.user.eloRating;
      if (participant.leavePenaltyAppliedAt) {
        return {
          battleId: battle.id,
          userId: participant.userId,
          oldElo: currentElo + Math.abs(participant.leavePenaltyElo ?? 0),
          newElo: currentElo,
          eloChange: participant.leavePenaltyElo ?? 0,
          placement: battle.participants.length || 1,
          totalVotePoints:
            rankings.find((ranking) => ranking.userId === participant.userId)
              ?.points ?? 0,
        };
      }

      const forfeited = rankings.some(
        (ranking) => ranking.userId === participant.userId && ranking.forfeited,
      );
      const eloChange = forfeited
        ? Math.round(-30 * getEloMultiplier(currentElo))
        : 0;

      return {
        battleId: battle.id,
        userId: participant.userId,
        oldElo: currentElo,
        newElo: Math.max(0, currentElo + eloChange),
        eloChange,
        placement: battle.participants.length || 1,
        totalVotePoints:
          rankings.find((ranking) => ranking.userId === participant.userId)
            ?.points ?? 0,
      };
    });

    await prisma.$transaction(async (tx) => {
      const claimedBattle = await tx.battle.updateMany({
        where: {
          id: battle.id,
          status: BattleStatus.VOTING,
          eloProcessed: false,
        },
        data: {
          status: BattleStatus.FINISHED,
          winnerId: null,
          finishedAt,
          eloProcessed: true,
        },
      });

      if (claimedBattle.count !== 1) {
        console.warn(
          `Duplicate finish attempt ignored while processing no-contest battle ${battle.id}.`,
        );
        return;
      }

      await Promise.all(
        rankings.map((ranking) =>
          tx.battleParticipant.update({
            where: {
              id: ranking.participantId,
            },
            data: {
              score: ranking.points,
              missedSubmission: true,
              technicalLoss: true,
            },
          }),
        ),
      );

      await Promise.all(
        noContestEloResults
          .filter((result) => result.eloChange !== 0)
          .map((result) => {
            const participant = battle.participants.find(
              (battleParticipant) =>
                battleParticipant.userId === result.userId,
            );
            const categoryStats = participant
              ? getCategoryStats(participant.user, ratingCategory)
              : null;

            return tx.user.update({
              where: {
                id: result.userId,
              },
              data: {
                ...(ratingCategory === "rap"
                  ? {}
                  : {
                      eloRating: result.newElo,
                    }),
                ...(categoryStats
                  ? {
                      [categoryStats.eloField]: result.newElo,
                    }
                  : {}),
              },
            });
          }),
      );

      await tx.battleEloResult.createMany({
        data: noContestEloResults,
        skipDuplicates: true,
      });
    });

    return (
      (await getFinishedBattleResult(battle.id)) ?? {
        battleId: battle.id,
        status: BattleStatus.FINISHED,
        isTie: true,
        winnerId: null,
        rankings,
        eloResults: noContestEloResults,
      }
    );
  }

  const scoreByUserId = new Map(
    rankings.map((ranking) => [ranking.userId, ranking.points]),
  );
  const adjustedScoreByUserId = new Map(
    rankings.map((ranking) => [
      ranking.userId,
      ranking.technicalLoss ? -1000 : ranking.points,
    ]),
  );
  const rankingByUserId = new Map(
    rankings.map((ranking) => [ranking.userId, ranking]),
  );
  const maxPossiblePoints = Math.max(
    1,
    ...rankings
      .filter((ranking) => !ranking.technicalLoss)
      .map((ranking) => ranking.points),
  );
  const eloResults = calculateBattleEloResults(
    battle.participants.map((participant) => ({
      userId: participant.userId,
      eloRating:
        getCategoryStats(participant.user, ratingCategory).elo ??
        participant.user.eloRating,
      totalVotePoints: adjustedScoreByUserId.get(participant.userId) ?? 0,
    })),
    {
      modeId: battle.mode,
    },
  ).map((result) => ({
    ...result,
    totalVotePoints: scoreByUserId.get(result.userId) ?? 0,
  })).map((result) => {
    const participant = battle.participants.find(
      (battleParticipant) => battleParticipant.userId === result.userId,
    );
    const categoryStats = participant
      ? getCategoryStats(participant.user, ratingCategory)
      : null;

    if (participant?.leavePenaltyAppliedAt) {
      const currentElo =
        categoryStats?.elo ?? participant.user.eloRating;

      return {
        ...result,
        oldElo: currentElo + Math.abs(participant.leavePenaltyElo ?? 0),
        newElo: currentElo,
        eloChange: participant.leavePenaltyElo ?? 0,
      };
    }

    if (!participant || categoryStats?.elo !== null) {
      return result;
    }

    const ranking = rankingByUserId.get(result.userId);
    const placementElo = getQualificationElo({
      points: ranking?.points ?? 0,
      maxPoints: maxPossiblePoints,
      placement: result.placement,
      playerCount: eloResults.length,
      technicalLoss: Boolean(ranking?.technicalLoss),
    });

    return {
      ...result,
      oldElo: 0,
      newElo: placementElo,
      eloChange: placementElo,
    };
  });
  const winnerCandidate = validRankings[0] ?? null;
  const isTie = Boolean(
    winnerCandidate &&
      validRankings
        .slice(1)
        .some((ranking) => rankingsAreStillTied(winnerCandidate, ranking)),
  );
  const winner = isTie ? null : validRankings[0];
  const lastPlacement =
    eloResults.length > 0
      ? Math.max(...eloResults.map((result) => result.placement))
      : 0;
  const lastPlaceUserIds = eloResults
    .filter(
      (result) => result.placement === lastPlacement && result.placement !== 1,
    )
    .map((result) => result.userId);
  const finishedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const claimedBattle = await tx.battle.updateMany({
      where: {
        id: battle.id,
        status: BattleStatus.VOTING,
        eloProcessed: false,
      },
      data: {
        status: BattleStatus.FINISHED,
        winnerId: winner?.userId ?? null,
        finishedAt,
        eloProcessed: true,
      },
    });

    if (claimedBattle.count !== 1) {
      console.warn(
        `Duplicate finish attempt ignored while processing battle ${battle.id}.`,
      );
      return;
    }

    await Promise.all(
      rankings.map((ranking) =>
        tx.battleParticipant.update({
          where: {
            id: ranking.participantId,
          },
          data: {
            score: ranking.points,
          },
        }),
      ),
    );

    await Promise.all(
      eloResults.map((result) => {
        const participant = battle.participants.find(
          (battleParticipant) => battleParticipant.userId === result.userId,
        );
        const categoryStats = participant
          ? getCategoryStats(participant.user, ratingCategory)
          : null;

        return tx.user.update({
          where: {
            id: result.userId,
          },
          data: {
            ...(ratingCategory === "rap"
              ? {}
              : {
                  eloRating: result.newElo,
                }),
            ...(categoryStats
              ? {
                  [categoryStats.eloField]: result.newElo,
                  ...(participant?.leavePenaltyAppliedAt
                    ? {}
                    : {
                        [categoryStats.gamesField]: {
                          increment: 1,
                        },
                      }),
                  ...(result.placement <= 2
                    ? {
                        [categoryStats.winsField]: {
                          increment: 1,
                        },
                      }
                    : {}),
                }
              : {}),
          },
        });
      }),
    );

    if (eloResults.length > 0) {
      await tx.battleEloResult.createMany({
        data: eloResults.map((result) => ({
          battleId: battle.id,
          userId: result.userId,
          oldElo: result.oldElo,
          newElo: result.newElo,
          eloChange: result.eloChange,
          placement: result.placement,
          totalVotePoints: result.totalVotePoints,
        })),
        skipDuplicates: true,
      });
    }

    if (winner && ratingCategory !== "rap") {
      await tx.user.update({
        where: {
          id: winner.userId,
        },
        data: {
          wins: {
            increment: 1,
          },
        },
      });
    }

    if (!isTie && lastPlaceUserIds.length > 0 && ratingCategory !== "rap") {
      await tx.user.updateMany({
        where: {
          id: {
            in: lastPlaceUserIds,
          },
        },
        data: {
          losses: {
            increment: 1,
          },
        },
      });
    }
  });

  const finishedResult = await getFinishedBattleResult(battle.id);

  if (finishedResult) {
    return finishedResult;
  }

  return {
    battleId: battle.id,
    status: BattleStatus.FINISHED,
    isTie,
    winnerId: winner?.userId ?? null,
    rankings,
    eloResults,
  };
}

export async function maybeFinishBattle(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      status: true,
      votingStartedAt: true,
      votingEndsAt: true,
      participants: {
        select: {
          userId: true,
          forfeited: true,
          submission: {
            select: {
              id: true,
            },
          },
        },
      },
      votes: {
        select: {
          voterId: true,
        },
      },
      listeningProgress: {
        where: {
          completed: true,
        },
        select: {
          userId: true,
        },
      },
    },
  });

  if (!battle || battle.status !== BattleStatus.VOTING) {
    return null;
  }

  const validSubmissionCount = battle.participants.filter(
    (participant) => participant.submission,
  ).length;
  const eligibleVoterIds = battle.participants
    .filter((participant) => !participant.forfeited)
    .map((participant) => participant.userId);
  const votedUserIds = new Set(battle.votes.map((vote) => vote.voterId));
  const completedListeningUserIds = new Set(
    battle.listeningProgress.map((progress) => progress.userId),
  );
  const allEligibleVotersVoted =
    eligibleVoterIds.length > 0 &&
    eligibleVoterIds.every(
      (userId) =>
        votedUserIds.has(userId) && completedListeningUserIds.has(userId),
    );
  const allEligibleListenersCompleted =
    eligibleVoterIds.length > 0 &&
    eligibleVoterIds.every((userId) => completedListeningUserIds.has(userId));
  const votingExpired = Boolean(
    battle.votingStartedAt &&
      battle.votingEndsAt &&
      Date.now() >= battle.votingEndsAt.getTime(),
  );

  if (validSubmissionCount === 0) {
    return finishBattle(battle.id);
  }

  if (!allEligibleListenersCompleted && !votingExpired) {
    return null;
  }

  if (!allEligibleVotersVoted && !votingExpired) {
    return null;
  }

  return finishBattle(battle.id);
}
