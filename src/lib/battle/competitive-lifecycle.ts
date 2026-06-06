import {
  BattleParticipantPresence,
  BattleStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const MATCH_RECONNECT_GRACE_SECONDS = Number(
  process.env.MATCH_RECONNECT_GRACE_SECONDS ?? 300,
);
export const MATCH_HEARTBEAT_STALE_SECONDS = Number(
  process.env.MATCH_HEARTBEAT_STALE_SECONDS ?? 30,
);

const finishedStatuses = new Set<BattleStatus>([
  BattleStatus.FINISHED,
  BattleStatus.CANCELLED,
]);
let lastReconnectSweepAt = 0;

export type AbandonReason =
  | "EXPLICIT_ABANDON"
  | "RECONNECT_TIMEOUT"
  | "LEGACY_LEAVE";

export const ABANDON_ELO_PENALTY = 30;

export function isCompetitiveLifecycleSchemaMissing(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.message).includes("BattleParticipant")
  );
}

function isRapMode(mode: string) {
  return mode.startsWith("rap_");
}

export function getAbandonPenaltyForStatus(status: BattleStatus) {
  return finishedStatuses.has(status) ? 0 : ABANDON_ELO_PENALTY;
}

export function getReconnectExpiresAt(now = new Date()) {
  return new Date(now.getTime() + MATCH_RECONNECT_GRACE_SECONDS * 1000);
}

type TxClient = Prisma.TransactionClient;

async function applyPenaltyInTransaction({
  tx,
  participantId,
  userId,
  battle,
  reason,
  now,
}: {
  tx: TxClient;
  participantId: string;
  userId: string;
  battle: {
    id: string;
    mode: string;
    status: BattleStatus;
  };
  reason: AbandonReason;
  now: Date;
}) {
  const penalty = getAbandonPenaltyForStatus(battle.status);

  const claimed = await tx.battleParticipant.updateMany({
    where: {
      id: participantId,
      leavePenaltyAppliedAt: null,
    },
    data: {
      presenceStatus: BattleParticipantPresence.ABANDONED,
      abandonedAt: now,
      abandonReason: reason,
      leavePenaltyAppliedAt: now,
      leavePenaltyElo: penalty > 0 ? -penalty : 0,
      reconnectExpiresAt: null,
      forfeited: true,
      technicalLoss: true,
      missedSubmission:
        battle.status === BattleStatus.SUBMISSION ||
        battle.status === BattleStatus.VOTING,
      leftAt: now,
    },
  });

  if (claimed.count !== 1) {
    const participant = await tx.battleParticipant.findUnique({
      where: {
        id: participantId,
      },
      select: {
        leavePenaltyElo: true,
        presenceStatus: true,
      },
    });

    return {
      applied: false,
      penalty: Math.abs(participant?.leavePenaltyElo ?? penalty),
      presenceStatus:
        participant?.presenceStatus ?? BattleParticipantPresence.ABANDONED,
    };
  }

  if (penalty > 0) {
    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        eloRating: true,
        producerElo: true,
        producerGames: true,
        rapElo: true,
        rapGames: true,
      },
    });

    if (user) {
      if (isRapMode(battle.mode)) {
        if (user.rapElo !== null) {
          await tx.user.update({
            where: {
              id: userId,
            },
            data: {
              rapElo: Math.max(0, user.rapElo - penalty),
              rapGames: {
                increment: 1,
              },
            },
          });
        }
      } else {
        if (user.producerElo !== null) {
          const nextProducerElo = Math.max(0, user.producerElo - penalty);

          await tx.user.update({
            where: {
              id: userId,
            },
            data: {
              producerElo: nextProducerElo,
              eloRating: nextProducerElo,
              producerGames: {
                increment: 1,
              },
            },
          });
        }
      }
    }
  }

  if (
    battle.status === BattleStatus.WAITING ||
    battle.status === BattleStatus.READY
  ) {
    await tx.battle.updateMany({
      where: {
        id: battle.id,
        status: {
          in: [BattleStatus.WAITING, BattleStatus.READY],
        },
      },
      data: {
        status: BattleStatus.CANCELLED,
      },
    });
  }

  return {
    applied: true,
    penalty,
    presenceStatus: BattleParticipantPresence.ABANDONED,
  };
}

export async function markBattleHeartbeat({
  battleId,
  userId,
}: {
  battleId: string;
  userId: string;
}) {
  const now = new Date();

  const participant = await prisma.battleParticipant.findUnique({
    where: {
      battleId_userId: {
        battleId,
        userId,
      },
    },
    select: {
      id: true,
      presenceStatus: true,
      connectedAt: true,
      battle: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!participant) {
    return null;
  }

  if (
    finishedStatuses.has(participant.battle.status) ||
    participant.presenceStatus === BattleParticipantPresence.ABANDONED
  ) {
    return participant;
  }

  return prisma.battleParticipant.update({
    where: {
      id: participant.id,
    },
    data: {
      presenceStatus:
        participant.presenceStatus === BattleParticipantPresence.DISCONNECTED
          ? BattleParticipantPresence.RECONNECTED
          : BattleParticipantPresence.CONNECTED,
      lastSeenAt: now,
      connectedAt: participant.connectedAt ?? now,
      reconnectedAt:
        participant.presenceStatus === BattleParticipantPresence.DISCONNECTED
          ? now
          : undefined,
      disconnectedAt: null,
      reconnectExpiresAt: null,
    },
  });
}

export async function markParticipantDisconnected({
  battleId,
  userId,
}: {
  battleId: string;
  userId: string;
}) {
  const now = new Date();

  return prisma.battleParticipant.updateMany({
    where: {
      battleId,
      userId,
      presenceStatus: {
        in: [
          BattleParticipantPresence.CONNECTED,
          BattleParticipantPresence.RECONNECTED,
        ],
      },
      battle: {
        status: {
          notIn: [BattleStatus.FINISHED, BattleStatus.CANCELLED],
        },
      },
    },
    data: {
      presenceStatus: BattleParticipantPresence.DISCONNECTED,
      disconnectedAt: now,
      reconnectExpiresAt: getReconnectExpiresAt(now),
    },
  });
}

export async function abandonBattleParticipant({
  battleId,
  userId,
  reason,
}: {
  battleId: string;
  userId: string;
  reason: AbandonReason;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const participant = await tx.battleParticipant.findUnique({
      where: {
        battleId_userId: {
          battleId,
          userId,
        },
      },
      select: {
        id: true,
        userId: true,
        battle: {
          select: {
            id: true,
            mode: true,
            status: true,
          },
        },
      },
    });

    if (!participant) {
      return null;
    }

    if (finishedStatuses.has(participant.battle.status)) {
      return {
        applied: false,
        penalty: 0,
        presenceStatus: BattleParticipantPresence.CONNECTED,
      };
    }

    return applyPenaltyInTransaction({
      tx,
      participantId: participant.id,
      userId: participant.userId,
      battle: participant.battle,
      reason,
      now,
    });
  });
}

export async function processReconnectTimeouts(battleId?: string) {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - MATCH_HEARTBEAT_STALE_SECONDS * 1000,
  );

  await prisma.battleParticipant.updateMany({
    where: {
      ...(battleId ? { battleId } : {}),
      presenceStatus: {
        in: [
          BattleParticipantPresence.CONNECTED,
          BattleParticipantPresence.RECONNECTED,
        ],
      },
      OR: [
        {
          lastSeenAt: {
            lt: staleBefore,
          },
        },
        {
          lastSeenAt: null,
          joinedAt: {
            lt: staleBefore,
          },
        },
      ],
      user: {
        username: {
          not: {
            startsWith: "dev_fake_player_",
          },
        },
      },
      battle: {
        status: {
          notIn: [BattleStatus.FINISHED, BattleStatus.CANCELLED],
        },
      },
    },
    data: {
      presenceStatus: BattleParticipantPresence.DISCONNECTED,
      disconnectedAt: now,
      reconnectExpiresAt: getReconnectExpiresAt(now),
    },
  });

  const expiredParticipants = await prisma.battleParticipant.findMany({
    where: {
      ...(battleId ? { battleId } : {}),
      presenceStatus: BattleParticipantPresence.DISCONNECTED,
      reconnectExpiresAt: {
        lte: now,
      },
      battle: {
        status: {
          notIn: [BattleStatus.FINISHED, BattleStatus.CANCELLED],
        },
      },
    },
    select: {
      battleId: true,
      userId: true,
    },
    take: 50,
  });

  const results = [];

  for (const participant of expiredParticipants) {
    results.push(
      await abandonBattleParticipant({
        battleId: participant.battleId,
        userId: participant.userId,
        reason: "RECONNECT_TIMEOUT",
      }),
    );
  }

  return {
    processed: results.length,
  };
}

export async function getActiveBattleForUser(userId: string) {
  const now = Date.now();

  if (now - lastReconnectSweepAt > 10_000) {
    lastReconnectSweepAt = now;
    await processReconnectTimeouts();
  }

  const activeBattles = await prisma.battleParticipant.findMany({
    where: {
      userId,
      presenceStatus: {
        not: BattleParticipantPresence.ABANDONED,
      },
      battle: {
        status: {
          notIn: [BattleStatus.FINISHED, BattleStatus.CANCELLED],
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
    take: 5,
    select: {
      id: true,
      presenceStatus: true,
      reconnectExpiresAt: true,
      battle: {
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          maxPlayers: true,
          endsAt: true,
          readyEndsAt: true,
          submissionEndsAt: true,
          votingEndsAt: true,
          participants: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (activeBattles.length > 1 && process.env.NODE_ENV !== "production") {
    console.warn("Multiple active battles found for user; returning newest.", {
      userId,
      battleIds: activeBattles.map((participant) => participant.battle.id),
    });
  }

  return activeBattles[0] ?? null;
}
