export type ScoreVoteInput = {
  scores: Array<{
    participantId: string;
    score: number;
  }>;
};

export type ScoreVoteValidationInput = ScoreVoteInput & {
  voterParticipantId?: string | null;
  validParticipantIds?: string[];
};

export type ScoreVoteValidationResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

export function calculateScoreTotals(votes: Array<{ participantId: string; score: number }>) {
  const scores = new Map<string, number>();

  for (const vote of votes) {
    scores.set(vote.participantId, (scores.get(vote.participantId) ?? 0) + vote.score);
  }

  return scores;
}

export function validateScoreVote({
  scores,
  voterParticipantId,
  validParticipantIds,
}: ScoreVoteValidationInput): ScoreVoteValidationResult {
  if (!Array.isArray(scores) || scores.length === 0) {
    return {
      success: false,
      error: "Score every eligible submission before submitting.",
    };
  }

  const participantIds = scores.map((score) => score.participantId);

  if (new Set(participantIds).size !== participantIds.length) {
    return {
      success: false,
      error: "Each submission can only receive one score.",
    };
  }

  if (scores.some((score) => !Number.isInteger(score.score) || score.score < 1 || score.score > 10)) {
    return {
      success: false,
      error: "Scores must be between 1 and 10.",
    };
  }

  if (voterParticipantId && participantIds.includes(voterParticipantId)) {
    return {
      success: false,
      error: "You cannot vote for yourself.",
    };
  }

  if (validParticipantIds) {
    const validSet = new Set(validParticipantIds);

    if (
      participantIds.length !== validParticipantIds.length ||
      participantIds.some((participantId) => !validSet.has(participantId))
    ) {
      return {
        success: false,
        error: "Score every eligible submission before submitting.",
      };
    }
  }

  return {
    success: true,
  };
}
