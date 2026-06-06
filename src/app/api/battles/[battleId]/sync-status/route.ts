import { NextResponse } from "next/server";
import { BattleStatus } from "@prisma/client";

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

function logSyncStatus(
  battleId: string,
  step: string,
  extra?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("sync-status", {
      battleId,
      step,
      ...extra,
    });
  }
}

async function runSyncStep<T>(
  battleId: string,
  step: string,
  task: () => Promise<T>,
) {
  logSyncStatus(battleId, `${step}:start`);

  try {
    const result = await task();
    logSyncStatus(battleId, `${step}:done`);
    return result;
  } catch (error) {
    console.error("sync-status step failed", {
      battleId,
      step,
      error,
    });
    throw error;
  }
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
    const access = await getBattleParticipantOrThrow(user.id, battleId);

    logSyncStatus(battleId, "called", {
      status: access.battle.status,
      participantPresence: access.participant.presenceStatus,
    });

    if (
      access.battle.status === BattleStatus.FINISHED ||
      access.battle.status === BattleStatus.CANCELLED
    ) {
      logSyncStatus(battleId, "terminal-status");

      return NextResponse.json({
        status: access.battle.status,
      });
    }

    await runSyncStep(battleId, "maybeCancelExpiredReadyBattle", () =>
      maybeCancelExpiredReadyBattle(battleId),
    );
    await runSyncStep(battleId, "processReconnectTimeouts", () =>
      processReconnectTimeouts(battleId),
    );
    try {
      await runSyncStep(battleId, "advanceDraftIfNeeded", () =>
        advanceDraftIfNeeded(battleId),
      );
    } catch (error) {
      if (
        !(error instanceof DraftingError) ||
        error.message !== "Drafting is not open for this battle."
      ) {
        throw error;
      }
    }
    await runSyncStep(battleId, "maybeMoveBattleToSubmission", () =>
      maybeMoveBattleToSubmission(battleId),
    );
    await runSyncStep(battleId, "maybeMoveBattleToVoting", () =>
      maybeMoveBattleToVoting(battleId),
    );

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
      await runSyncStep(battleId, "maybeFinishBattle", () =>
        maybeFinishBattle(battleId),
      );
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
