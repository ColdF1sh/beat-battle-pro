import { NextResponse } from "next/server";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  getActiveBattleForUser,
  isCompetitiveLifecycleSchemaMissing,
} from "@/lib/battle/competitive-lifecycle";
import { battleModes } from "@/lib/battle/modes";

function getEndsAtForPhase(battle: {
  status: string;
  endsAt: Date | null;
  readyEndsAt: Date | null;
  submissionEndsAt: Date | null;
  votingEndsAt: Date | null;
}) {
  if (battle.status === "READY") {
    return battle.readyEndsAt;
  }

  if (battle.status === "SUBMISSION") {
    return battle.submissionEndsAt;
  }

  if (battle.status === "VOTING") {
    return battle.votingEndsAt;
  }

  return battle.endsAt;
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const user = await requireCurrentUser();
    const activeBattle = await getActiveBattleForUser(user.id);

    if (!activeBattle) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("active battle lookup timing", {
          hasBattle: false,
          elapsedMs: Date.now() - startedAt,
        });
      }

      return NextResponse.json({
        battle: null,
      });
    }

    const mode = battleModes.find(
      (battleMode) => battleMode.id === activeBattle.battle.mode,
    );

    const response = NextResponse.json({
      battle: {
        id: activeBattle.battle.id,
        title: activeBattle.battle.title,
        mode: activeBattle.battle.mode,
        modeName: mode?.name ?? activeBattle.battle.mode,
        status: activeBattle.battle.status,
        participantCount: activeBattle.battle.participants.length,
        maxPlayers: activeBattle.battle.maxPlayers,
        endsAt: getEndsAtForPhase(activeBattle.battle)?.toISOString() ?? null,
        reconnectExpiresAt:
          activeBattle.reconnectExpiresAt?.toISOString() ?? null,
      },
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("active battle lookup timing", {
        battleId: activeBattle.battle.id,
        status: activeBattle.battle.status,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    if (isCompetitiveLifecycleSchemaMissing(error)) {
      console.warn(
        "Competitive lifecycle migration is not applied. Run pnpm prisma migrate dev.",
      );

      return NextResponse.json({
        battle: null,
        lifecycleUnavailable: true,
        message:
          process.env.NODE_ENV !== "production"
            ? "Competitive lifecycle migration is not applied. Run pnpm prisma migrate dev."
            : undefined,
      });
    }

    console.error("Active battle lookup error:", error);

    return NextResponse.json(
      {
        error: "Failed to check active battle.",
      },
      { status: 500 },
    );
  }
}
