import { NextResponse } from "next/server";
import { BattleParticipantPresence } from "@prisma/client";

import {
  ApiAccessError,
  assertCanVoteInBattle,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  rateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/api/rate-limit";
import { jsonValidationError, validateJsonBody } from "@/lib/api/validation";
import { maybeFinishBattle } from "@/lib/battle/transitions";
import { validateScoreVote } from "@/lib/battle/voting";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema, voteSchema } from "@/lib/validations/battle";

type BattleVoteRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: BattleVoteRouteProps) {
  const limit = rateLimit(request, {
    route: "battle:vote",
    windowMs: 60 * 1000,
    maxRequests: 10,
  });

  if (!limit.allowed) {
    return rateLimitResponse(limit);
  }

  try {
    const user = await requireCurrentUser();

    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return withRateLimitHeaders(
        jsonValidationError([
          {
            field: "battleId",
            message: "Battle ID is required.",
          },
        ]),
        limit,
      );
    }

    const { battleId } = parsedParams.data;
    await assertCanVoteInBattle(user.id, battleId);

    const parsedBody = await validateJsonBody(request, voteSchema);

    if (!parsedBody.success) {
      return withRateLimitHeaders(parsedBody.response, limit);
    }

    const parsed = parsedBody.data;

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
            submission: {
              select: {
                id: true,
              },
            },
          },
        },
        listeningProgress: {
          where: {
            userId: user.id,
            completed: true,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!battle) {
      return withRateLimitHeaders(jsonError("Battle not found.", 404), limit);
    }

    if (battle.listeningProgress.length === 0) {
      return withRateLimitHeaders(
        jsonError("You must listen to all submissions before voting.", 400),
        limit,
      );
    }

    const voterParticipant =
      battle.participants.find((participant) => participant.userId === user.id) ??
      null;
    const eligibleParticipants = battle.participants.filter(
      (participant) =>
        participant.userId !== user.id &&
        !participant.forfeited &&
        participant.presenceStatus !== BattleParticipantPresence.ABANDONED &&
        participant.submission,
    );
    const validation = validateScoreVote({
      scores: parsed.scores,
      voterParticipantId: voterParticipant?.id,
      validParticipantIds: eligibleParticipants.map((participant) => participant.id),
    });

    if (!validation.success) {
      return withRateLimitHeaders(
        jsonError(validation.error, 400),
        limit,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.vote.deleteMany({
        where: {
          battleId,
          voterId: user.id,
        },
      });

      await tx.vote.createMany({
        data: parsed.scores.map((score) => ({
          battleId,
          voterId: user.id,
          participantId: score.participantId,
          score: score.score,
        })),
      });
    });

    await maybeFinishBattle(battleId);

    return withRateLimitHeaders(
      NextResponse.json({
        status: "success",
      }),
      limit,
    );
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return withRateLimitHeaders(jsonAccessError(error), limit);
    }

    console.error("Battle vote error:", error);

    return withRateLimitHeaders(
      jsonError("Failed to submit vote.", 500),
      limit,
    );
  }
}
