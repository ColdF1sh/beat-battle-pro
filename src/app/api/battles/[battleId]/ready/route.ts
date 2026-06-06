import { BattleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { maybeStartReadyBattle } from "@/lib/battle/transitions";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema } from "@/lib/validations/battle";

type ReadyRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_request: Request, { params }: ReadyRouteProps) {
  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;
    const { battle, participant } = await getBattleParticipantOrThrow(
      user.id,
      battleId,
    );

    if (participant.presenceStatus === "ABANDONED") {
      return jsonError("You abandoned this battle and cannot ready up.", 403);
    }

    if (battle.status !== BattleStatus.READY) {
      return jsonError("Ready check is not open for this battle.", 400);
    }

    await prisma.battleReadyCheck.upsert({
      where: {
        battleId_userId: {
          battleId,
          userId: user.id,
        },
      },
      update: {
        isReady: true,
        readyAt: new Date(),
      },
      create: {
        battleId,
        userId: user.id,
        isReady: true,
        readyAt: new Date(),
      },
    });

    const updatedBattle = await maybeStartReadyBattle(battleId);
    const readyChecks = await prisma.battleReadyCheck.findMany({
      where: {
        battleId,
      },
      select: {
        userId: true,
        isReady: true,
        readyAt: true,
      },
    });

    return NextResponse.json({
      status: updatedBattle?.status ?? battle.status,
      readyChecks,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle ready error:", error);

    return jsonError("Failed to mark player ready.", 500);
  }
}
