import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  maybeFinishBattle,
  maybeCancelExpiredReadyBattle,
  maybeMoveBattleToSubmission,
  maybeMoveBattleToVoting,
} from "@/lib/battle/transitions";
import { advanceDraftIfNeeded, DraftingError } from "@/lib/battle/drafting/service";
import { processReconnectTimeouts } from "@/lib/battle/competitive-lifecycle";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema } from "@/lib/validations/battle";

type SyncStatusRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: SyncStatusRouteProps,
) {
  const startedAt = Date.now();
  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;
    await getBattleParticipantOrThrow(user.id, battleId);

    if (process.env.NODE_ENV !== "production") {
      console.debug("sync-status called", { battleId });
    }

    await maybeCancelExpiredReadyBattle(battleId);
    await processReconnectTimeouts(battleId);
    try {
      await advanceDraftIfNeeded(battleId);
    } catch (error) {
      if (
        !(error instanceof DraftingError) ||
        error.message !== "Drafting is not open for this battle."
      ) {
        throw error;
      }
    }
    await maybeMoveBattleToSubmission(battleId);
    await maybeMoveBattleToVoting(battleId);

    const battle = await prisma.battle.findUnique({
      where: {
        id: battleId,
      },
      select: {
        status: true,
        votingStartedAt: true,
      },
    });

    if (!battle) {
      return jsonError("Battle not found.", 404);
    }

    if (battle.status === "VOTING" && battle.votingStartedAt) {
      await maybeFinishBattle(battleId);
    }

    const syncedBattle = await prisma.battle.findUnique({
      where: {
        id: battleId,
      },
      select: {
        status: true,
      },
    });

    const response = NextResponse.json({
      status: syncedBattle?.status ?? battle.status,
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("sync-status timing", {
        battleId,
        status: syncedBattle?.status ?? battle.status,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle status sync error:", {
      error,
      elapsedMs: Date.now() - startedAt,
    });

    return jsonError("Failed to sync battle status.", 500);
  }
}
