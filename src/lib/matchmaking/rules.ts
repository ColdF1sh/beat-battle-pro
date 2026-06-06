export const QUEUE_MAX_AGE_MS = 30 * 60 * 1000;
export const MATCHMAKING_BATTLE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const MATCHMAKING_BATTLE_SOURCE = "MATCHMAKING";

export type QueueCandidate = {
  userId: string;
  createdAt: Date;
  status: string;
};

export type BattleCandidate = {
  createdAt: Date;
  status: string;
  source?: string | null;
};

export function isFreshQueueEntry(
  entry: Pick<QueueCandidate, "createdAt" | "status">,
  now = new Date(),
) {
  return (
    entry.status === "SEARCHING" &&
    now.getTime() - entry.createdAt.getTime() <= QUEUE_MAX_AGE_MS
  );
}

export function canMatchQueueEntry(
  entry: QueueCandidate,
  currentUserId: string,
  now = new Date(),
) {
  return entry.userId !== currentUserId && isFreshQueueEntry(entry, now);
}

export function pickOldestValidQueueEntry(
  entries: QueueCandidate[],
  currentUserId: string,
  now = new Date(),
) {
  return entries
    .filter((entry) => canMatchQueueEntry(entry, currentUserId, now))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .at(0);
}

export function isReusableMatchmakingBattle(
  battle: BattleCandidate,
  now = new Date(),
) {
  const allowedStatuses = new Set(["WAITING", "ACTIVE", "SUBMISSION", "VOTING"]);
  const isFresh =
    now.getTime() - battle.createdAt.getTime() <=
    MATCHMAKING_BATTLE_MAX_AGE_MS;

  return (
    battle.source === MATCHMAKING_BATTLE_SOURCE &&
    allowedStatuses.has(battle.status) &&
    isFresh
  );
}
