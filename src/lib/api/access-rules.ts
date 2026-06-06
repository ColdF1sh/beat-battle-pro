export type AccessRuleParticipant = {
  userId: string;
  participantId?: string;
};

export function isParticipant(
  userId: string,
  participants: AccessRuleParticipant[],
) {
  return participants.some((participant) => participant.userId === userId);
}

export function canViewBattle(
  userId: string,
  participants: AccessRuleParticipant[],
) {
  return isParticipant(userId, participants);
}

export function isOwnSubmission(
  userId: string,
  submission: {
    userId: string;
  },
) {
  return submission.userId === userId;
}

export function canSubmitForParticipant(
  userId: string,
  participant: AccessRuleParticipant | null | undefined,
) {
  return Boolean(participant && participant.userId === userId);
}

export function canVoteWithStatus(status: string) {
  return status === "VOTING";
}
