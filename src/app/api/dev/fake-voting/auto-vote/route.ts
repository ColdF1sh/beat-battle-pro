import { BattleParticipantPresence, BattleStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { validateJsonBody } from "@/lib/api/validation";
import { maybeFinishBattle } from "@/lib/battle/transitions";
import { prisma } from "@/lib/prisma";

const fakeUserPrefix = "dev_fake_player_";

const autoVoteSchema = z.object({
  battleId: z.string().min(1, "Battle ID is required."),
});

function isEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_FAKE_PLAYERS === "true"
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function pickScoreTargets(
  voterParticipantId: string,
  eligibleParticipantIds: string[],
) {
  return eligibleParticipantIds
    .filter((participantId) => participantId !== voterParticipantId)
    .map((participantId, index) => ({
      participantId,
      score: Math.max(1, Math.min(10, 4 + Math.floor(Math.random() * 7) - (index % 2))),
    }));
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!isEnabled()) {
    return jsonError(
      "Dev fake players are disabled. Set ENABLE_DEV_FAKE_PLAYERS=true and restart dev server.",
      403,
    );
  }

  try {
    const user = await requireCurrentUser();
    const parsedBody = await validateJsonBody(request, autoVoteSchema);

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const { battleId } = parsedBody.data;
    await getBattleParticipantOrThrow(user.id, battleId);

    const battle = await prisma.battle.findUnique({
      where: {
        id: battleId,
      },
      select: {
        id: true,
        status: true,
        participants: {
          select: {
            id: true,
            userId: true,
            forfeited: true,
            presenceStatus: true,
            user: {
              select: {
                username: true,
              },
            },
            submission: {
              select: {
                id: true,
              },
            },
          },
          orderBy: [
            {
              joinedAt: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
      },
    });

    if (!battle) {
      return jsonError("Battle not found.", 404);
    }

    if (battle.status !== BattleStatus.VOTING) {
      return jsonError("Voting is not open for this battle.", 400);
    }

    const activeSubmittedParticipants = battle.participants.filter(
      (participant) =>
        !participant.forfeited &&
        participant.presenceStatus !== BattleParticipantPresence.ABANDONED &&
        participant.submission,
    );
    const fakeParticipants = activeSubmittedParticipants.filter((participant) =>
      participant.user.username.startsWith(fakeUserPrefix),
    );

    if (fakeParticipants.length === 0) {
      return jsonError("This battle has no dev fake players.", 400);
    }

    const eligibleParticipantIds = activeSubmittedParticipants.map(
      (participant) => participant.id,
    );

    if (eligibleParticipantIds.length < 2) {
      return jsonError(
        "Not enough submitted participants for fake score votes.",
        400,
      );
    }

    const voteData = fakeParticipants.flatMap((participant) => {
      const targets = pickScoreTargets(participant.id, eligibleParticipantIds);

      if (targets.length === 0) {
        return [];
      }

      return targets.map((target) => ({
        battleId: battle.id,
        voterId: participant.userId,
        participantId: target.participantId,
        score: target.score,
      }));
    });

    if (voteData.length === 0) {
      const currentBattle = await prisma.battle.findUnique({
        where: {
          id: battle.id,
        },
        select: {
          status: true,
        },
      });

      return NextResponse.json({
        status: "success",
        createdVotes: 0,
        battleStatus: currentBattle?.status ?? battle.status,
      });
    }

    await prisma.$transaction(async (tx) => {
      for (const participant of fakeParticipants) {
        await tx.battleListeningProgress.upsert({
          where: {
            battleId_userId: {
              battleId: battle.id,
              userId: participant.userId,
            },
          },
          update: {
            completed: true,
            completedAt: new Date(),
          },
          create: {
            battleId: battle.id,
            userId: participant.userId,
            completed: true,
            completedAt: new Date(),
          },
        });
      }

      for (const vote of voteData) {
        await tx.vote.upsert({
          where: {
            battleId_voterId_participantId: {
              battleId: vote.battleId,
              voterId: vote.voterId,
              participantId: vote.participantId,
            },
          },
          update: {
            score: vote.score,
          },
          create: vote,
        });
      }
    });

    await maybeFinishBattle(battle.id);

    const updatedBattle = await prisma.battle.findUnique({
      where: {
        id: battle.id,
      },
      select: {
        status: true,
      },
    });

    const response = NextResponse.json({
      status: "success",
      createdVotes: voteData.length,
      battleStatus: updatedBattle?.status ?? battle.status,
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("fake vote generation timing", {
        battleId: battle.id,
        fakePlayers: fakeParticipants.length,
        createdVotes: voteData.length,
        battleStatus: updatedBattle?.status ?? battle.status,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Dev fake voting error:", {
      error,
      elapsedMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        error: "Failed to create fake player votes.",
        detail:
          process.env.NODE_ENV !== "production" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}
