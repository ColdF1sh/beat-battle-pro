import { BattleStatus, MatchmakingQueueStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { validateJsonBody } from "@/lib/api/validation";
import { activeBattleModes } from "@/lib/battle/modes";
import type { BattleMode } from "@/lib/battle/modes";
import {
  getActiveBattleForUser,
  isCompetitiveLifecycleSchemaMissing,
} from "@/lib/battle/competitive-lifecycle";
import { prepareRapBeatForBattle } from "@/lib/battle/sound-pack";
import { getReadyCheckDeadline } from "@/lib/battle/transitions";
import { prisma } from "@/lib/prisma";

const MATCHMAKING_BATTLE_SOURCE = "MATCHMAKING";
const DEV_FAKE_USERNAMES = [
  "dev_fake_player_1",
  "dev_fake_player_2",
  "dev_fake_player_3",
  "dev_fake_player_4",
];

const activeModesById = new Map<string, BattleMode>(
  activeBattleModes.map((mode) => [mode.id, mode]),
);

const fakeMatchmakingSchema = z.object({
  mode: z
    .string()
    .min(1, "Battle mode is required.")
    .refine((mode) => activeModesById.has(mode), "Battle mode is not enabled."),
});

function isDevFakePlayersEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_FAKE_PLAYERS === "true"
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function getFakeUsers() {
  const passwordHash = await bcrypt.hash("dev-fake-player-password", 10);

  return Promise.all(
    DEV_FAKE_USERNAMES.map((username) =>
      prisma.user.upsert({
        where: {
          username,
        },
        update: {
          displayName: username,
        },
        create: {
          email: `${username}@example.local`,
          username,
          displayName: username,
          passwordHash,
          eloRating: 500,
        },
        select: {
          id: true,
        },
      }),
    ),
  );
}

export async function POST(request: Request) {
  if (!isDevFakePlayersEnabled()) {
    return jsonError(
      "Dev fake players are disabled. Set ENABLE_DEV_FAKE_PLAYERS=true and restart dev server.",
      403,
    );
  }

  try {
    const user = await requireCurrentUser();
    const parsedBody = await validateJsonBody(request, fakeMatchmakingSchema);

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    let activeBattle = null;
    try {
      activeBattle = await getActiveBattleForUser(user.id);
    } catch (error) {
      if (isCompetitiveLifecycleSchemaMissing(error)) {
        return NextResponse.json(
          {
            error:
              "Competitive lifecycle migration is not applied. Run pnpm prisma migrate dev.",
          },
          { status: 503 },
        );
      }

      throw error;
    }

    if (activeBattle) {
      return NextResponse.json(
        {
          error: "You already have an active battle.",
          activeBattleId: activeBattle.battle.id,
        },
        { status: 409 },
      );
    }

    const mode = activeModesById.get(parsedBody.data.mode);

    if (!mode) {
      return jsonError("Battle mode is not enabled.", 400);
    }

    const queueEntry = await prisma.matchmakingQueue.findFirst({
      where: {
        userId: user.id,
        mode: mode.id,
        status: MatchmakingQueueStatus.SEARCHING,
      },
      select: {
        id: true,
      },
    });

    if (!queueEntry) {
      return jsonError("Start matchmaking for this mode first.", 409);
    }

    const fakeUsers = await getFakeUsers();
    const fakeUserIds = fakeUsers.map((fakeUser) => fakeUser.id);
    const participantUserIds = [user.id, ...fakeUserIds];
    const initialStatus = BattleStatus.READY;
    const durationMinutes = mode.defaultDurationMinutes;
    const startedAt = null;
    const endsAt = null;
    const readyDeadline = getReadyCheckDeadline();

    const result = await prisma.$transaction(async (tx) => {
      const battle = await tx.battle.create({
        data: {
          title: `${mode.name} Dev Battle`,
          mode: mode.id,
          source: MATCHMAKING_BATTLE_SOURCE,
          status: initialStatus,
          isPrivate: false,
          maxPlayers: mode.maxPlayers,
          durationMinutes,
          ...readyDeadline,
          startedAt,
          endsAt,
          createdById: user.id,
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

      await tx.battleReadyCheck.createMany({
        data: fakeUserIds.map((fakeUserId) => ({
          battleId: battle.id,
          userId: fakeUserId,
          isReady: true,
          readyAt: new Date(),
        })),
      });

      await tx.matchmakingQueue.deleteMany({
        where: {
          userId: user.id,
          mode: mode.id,
          status: MatchmakingQueueStatus.SEARCHING,
        },
      });

      return {
        status: "matched" as const,
        battleId: battle.id,
      };
    });

    await prepareRapBeatForBattle(result.battleId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Dev fake matchmaking fill error:", error);

    return jsonError(
      error instanceof Error
        ? `Failed to fill the room with fake players: ${error.message}`
        : "Failed to fill the room with fake players.",
      500,
    );
  }
}
