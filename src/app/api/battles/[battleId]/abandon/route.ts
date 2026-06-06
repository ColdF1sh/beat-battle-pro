import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { abandonBattleParticipant } from "@/lib/battle/competitive-lifecycle";
import { battleParamsSchema } from "@/lib/validations/battle";

type AbandonRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: AbandonRouteProps,
) {
  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;
    await getBattleParticipantOrThrow(user.id, battleId);

    const result = await abandonBattleParticipant({
      battleId,
      userId: user.id,
      reason: "EXPLICIT_ABANDON",
    });

    if (!result) {
      return jsonError("Battle not found.", 404);
    }

    return NextResponse.json({
      status: "success",
      applied: result.applied,
      alreadyAbandoned: !result.applied && result.presenceStatus === "ABANDONED",
      penalty: result.penalty,
      presenceStatus: result.presenceStatus,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle abandon error:", error);

    return jsonError("Failed to abandon battle.", 500);
  }
}
