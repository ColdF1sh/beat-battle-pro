import { BattleStatus, MatchmakingQueueStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { prisma } from "@/lib/prisma";

const MATCHMAKING_BATTLE_SOURCE = "MATCHMAKING";
const QUEUE_MAX_AGE_MINUTES = 30;
const BATTLE_REDIRECT_MAX_AGE_HOURS = 6;

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const queueCutoff = new Date(
      Date.now() - QUEUE_MAX_AGE_MINUTES * 60 * 1000,
    );
    const battleCutoff = new Date(
      Date.now() - BATTLE_REDIRECT_MAX_AGE_HOURS * 60 * 60 * 1000,
    );

    const queueEntries = await prisma.matchmakingQueue.findMany({
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

    if (queueEntries.length > 0) {
      return NextResponse.json({
        status: "searching",
        queuedModes: queueEntries.map((entry) => entry.mode),
      });
    }

    const activeBattle = await prisma.battle.findFirst({
      where: {
        source: MATCHMAKING_BATTLE_SOURCE,
        createdAt: {
          gte: battleCutoff,
        },
        status: {
          in: [
            BattleStatus.WAITING,
            BattleStatus.READY,
            BattleStatus.DRAFTING,
            BattleStatus.ACTIVE,
            BattleStatus.SUBMISSION,
            BattleStatus.VOTING,
          ],
        },
        participants: {
          some: {
            userId: user.id,
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (activeBattle) {
      return NextResponse.json({
        status: "matched",
        battleId: activeBattle.id,
      });
    }

    return NextResponse.json({
      status: "idle",
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Matchmaking status error:", error);

    return NextResponse.json(
      { error: "Something went wrong while checking matchmaking status." },
      { status: 500 },
    );
  }
}
