export type SubmissionTransitionParticipant = {
  id: string;
};

export type SubmissionTransitionSubmission = {
  participantId: string;
};

export function shouldMoveBattleToVoting({
  status,
  participants,
  submissions,
  endsAt,
  now = new Date(),
}: {
  status: string;
  participants: SubmissionTransitionParticipant[];
  submissions: SubmissionTransitionSubmission[];
  endsAt?: Date | null;
  now?: Date;
}) {
  if (status !== "ACTIVE" && status !== "SUBMISSION") {
    return false;
  }

  const submittedParticipantIds = new Set(
    submissions.map((submission) => submission.participantId),
  );
  const allParticipantsSubmitted =
    participants.length > 0 &&
    participants.every((participant) =>
      submittedParticipantIds.has(participant.id),
    );
  const timerExpired = Boolean(
    endsAt && now.getTime() >= endsAt.getTime(),
  );

  return allParticipantsSubmitted || timerExpired;
}

export function shouldFinishBattle({
  status,
  eloProcessed,
  eligibleVoterIds,
  votedUserIds,
}: {
  status: string;
  eloProcessed: boolean;
  eligibleVoterIds: string[];
  votedUserIds: string[];
}) {
  if (status !== "VOTING" || eloProcessed || eligibleVoterIds.length === 0) {
    return false;
  }

  const votedUsers = new Set(votedUserIds);

  return eligibleVoterIds.every((userId) => votedUsers.has(userId));
}
