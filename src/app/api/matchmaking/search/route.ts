import { BattleStatus, MatchmakingQueueStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  rateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/api/rate-limit";
import { validateJsonBody } from "@/lib/api/validation";
import { activeBattleModes } from "@/lib/battle/modes";
import type { BattleMode } from "@/lib/battle/modes";
import {
  getActiveBattleForUser,
  isCompetitiveLifecycleSchemaMissing,
} from "@/lib/battle/competitive-lifecycle";
import { prepareRapBeatForBattle } from "@/lib/battle/sound-pack";
import { prisma } from "@/lib/prisma";
import { getReadyCheckDeadline } from "@/lib/battle/transitions";
import { matchmakingSearchSchema } from "@/lib/validations/matchmaking";

const MATCHMAKING_BATTLE_SOURCE = "MATCHMAKING";
const QUEUE_MAX_AGE_MINUTES = 30;

const activeModesById = new Map<string, BattleMode>(
  activeBattleModes.map((mode) => [mode.id, mode]),
);

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, {
      route: "matchmaking:search",
      windowMs: 60 * 1000,
      maxRequests: 20,
    });

    if (!limit.allowed) {
      return rateLimitResponse(limit);
    }

    const user = await requireCurrentUser();

    const parsedBody = await validateJsonBody(
      request,
      matchmakingSearchSchema,
    );

    if (!parsedBody.success) {
      return withRateLimitHeaders(parsedBody.response, limit);
    }

    const parsed = parsedBody.data;
    const selectedModes = parsed.modes;
    let activeBattle = null;
    try {
      activeBattle = await getActiveBattleForUser(user.id);
    } catch (error) {
      if (isCompetitiveLifecycleSchemaMissing(error)) {
        return withRateLimitHeaders(
          NextResponse.json(
            {
              error:
                "Competitive lifecycle migration is not applied. Run pnpm prisma migrate dev.",
            },
            { status: 503 },
          ),
          limit,
        );
      }

      throw error;
    }

    if (activeBattle) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            error: "You already have an active battle.",
            activeBattleId: activeBattle.battle.id,
          },
          { status: 409 },
        ),
        limit,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const queueCutoff = new Date(
        Date.now() - QUEUE_MAX_AGE_MINUTES * 60 * 1000,
      );

      await tx.matchmakingQueue.deleteMany({
        where: {
          userId: user.id,
          status: MatchmakingQueueStatus.SEARCHING,
          createdAt: {
            lt: queueCutoff,
          },
        },
      });

      const existingQueueEntries = await tx.matchmakingQueue.findMany({
        where: {
          userId: user.id,
          status: MatchmakingQueueStatus.SEARCHING,
          createdAt: {
            gte: queueCutoff,
          },
        },
        select: {
          mode: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (existingQueueEntries.length > 0) {
        return {
          status: "searching" as const,
          queuedModes: existingQueueEntries.map((entry) => entry.mode),
        };
      }

      for (const modeId of selectedModes) {
        const matchedMode = activeModesById.get(modeId);
        const requiredOpponentCount = (matchedMode?.minPlayers ?? 5) - 1;
        const opponentQueueEntries = await tx.matchmakingQueue.findMany({
          where: {
            status: MatchmakingQueueStatus.SEARCHING,
            mode: modeId,
            createdAt: {
              gte: queueCutoff,
            },
            userId: {
              not: user.id,
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          take: requiredOpponentCount,
        });

        if (opponentQueueEntries.length < requiredOpponentCount) {
          continue;
        }

        const participantUserIds = [
          ...opponentQueueEntries.map((entry) => entry.userId),
          user.id,
        ];
        const maxPlayers = matchedMode?.maxPlayers ?? 5;
        const isFullRoom = participantUserIds.length >= maxPlayers;
        const initialStatus = isFullRoom
          ? BattleStatus.READY
          : BattleStatus.WAITING;
        const durationMinutes = matchedMode?.defaultDurationMinutes ?? 20;
        const readyDeadline =
          initialStatus === BattleStatus.READY
            ? getReadyCheckDeadline()
            : {
                readyStartedAt: null,
                readyEndsAt: null,
              };

        const battle = await tx.battle.create({
          data: {
            title: matchedMode
              ? `${matchedMode.name} Battle`
              : `Battle - ${modeId}`,
            mode: modeId,
            source: MATCHMAKING_BATTLE_SOURCE,
            status: initialStatus,
            isPrivate: false,
            maxPlayers,
            durationMinutes,
            ...readyDeadline,
            startedAt: null,
            endsAt: null,
            createdById: opponentQueueEntries[0]?.userId ?? user.id,
            soundPackId: null,
          },
          select: {
            id: true,
          },
        });

        await tx.battleParticipant.createMany({
          data: participantUserIds.map((userId) => ({
            battleId: battle.id,
            userId,
          })),
        });

        await tx.matchmakingQueue.deleteMany({
          where: {
            status: MatchmakingQueueStatus.SEARCHING,
            userId: {
              in: participantUserIds,
            },
          },
        });

        return {
          status: "matched" as const,
          battleId: battle.id,
          mode: modeId,
        };
      }

      await tx.matchmakingQueue.createMany({
        data: selectedModes.map((mode) => ({
          userId: user.id,
          mode,
          status: MatchmakingQueueStatus.SEARCHING,
        })),
        skipDuplicates: true,
      });

      return {
        status: "searching" as const,
        queuedModes: selectedModes,
      };
    });

    if (result.status === "matched") {
      await prepareRapBeatForBattle(result.battleId);
    }

    return withRateLimitHeaders(NextResponse.json(result), limit);
  } catch (error) {
    console.error("Matchmaking search failed", error);

    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error:
            "Could not join matchmaking because your user session is out of sync. Please log out and log in again.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Failed to search for battle. Check server logs." },
      { status: 500 },
    );
  }
}
