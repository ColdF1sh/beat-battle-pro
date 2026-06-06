import { BattleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { maybeStartVotingTimer } from "@/lib/battle/transitions";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema } from "@/lib/validations/battle";

type ListeningCompleteRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: ListeningCompleteRouteProps,
) {
  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;
    if (process.env.NODE_ENV !== "production") {
      console.debug("listening-complete called", { battleId, userId: user.id });
    }

    const { battle } = await getBattleParticipantOrThrow(user.id, battleId);
    const existingProgress = await prisma.battleListeningProgress.findUnique({
      where: {
        battleId_userId: {
          battleId,
          userId: user.id,
        },
      },
      select: {
        completed: true,
      },
    });
    const alreadyCompleted = Boolean(existingProgress?.completed);

    if (battle.status !== BattleStatus.VOTING) {
      if (alreadyCompleted) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("listening-complete already completed", {
            battleId,
            userId: user.id,
            status: battle.status,
          });
        }

        const completedBattle = await prisma.battle.findUnique({
          where: {
            id: battleId,
          },
          select: {
            votingStartedAt: true,
            votingEndsAt: true,
          },
        });

        return NextResponse.json({
          status: "success",
          alreadyCompleted: true,
          votingUnlocked: Boolean(completedBattle?.votingStartedAt),
          votingStartedAt: completedBattle?.votingStartedAt,
          votingEndsAt: completedBattle?.votingEndsAt,
        });
      }

      return jsonError("Listening is only available during voting.", 400);
    }

    const validSubmissionCount = await prisma.battleSubmission.count({
      where: {
        battleId,
      },
    });

    if (validSubmissionCount === 0) {
      return jsonError("There are no submissions to listen to.", 400);
    }

    if (!alreadyCompleted) {
      await prisma.battleListeningProgress.upsert({
        where: {
          battleId_userId: {
            battleId,
            userId: user.id,
          },
        },
        update: {
          completed: true,
          completedAt: new Date(),
        },
        create: {
          battleId,
          userId: user.id,
          completed: true,
          completedAt: new Date(),
        },
      });
    }

    const timerBattle = await maybeStartVotingTimer(battleId);
    const votingTimerStarted =
      !battle.votingStartedAt && Boolean(timerBattle?.votingStartedAt);

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        votingTimerStarted
          ? "voting timer started"
          : alreadyCompleted
            ? "listening-complete already completed"
            : "voting unlocked",
        { battleId, userId: user.id },
      );
    }

    const updatedBattle = await prisma.battle.findUnique({
      where: {
        id: battleId,
      },
      select: {
        votingStartedAt: true,
        votingEndsAt: true,
      },
    });

    return NextResponse.json({
      status: "success",
      alreadyCompleted,
      votingUnlocked: Boolean(
        timerBattle?.votingStartedAt ?? updatedBattle?.votingStartedAt,
      ),
      votingStartedAt: updatedBattle?.votingStartedAt,
      votingEndsAt: updatedBattle?.votingEndsAt,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle listening complete error:", error);

    return jsonError("Failed to complete listening.", 500);
  }
}
