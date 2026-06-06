import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { markBattleHeartbeat } from "@/lib/battle/competitive-lifecycle";
import { battleParamsSchema } from "@/lib/validations/battle";

type ReconnectRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: ReconnectRouteProps,
) {
  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;
    const { participant } = await getBattleParticipantOrThrow(user.id, battleId);

    if (participant.presenceStatus === "ABANDONED") {
      return jsonError("You abandoned this battle and cannot reconnect.", 409);
    }

    const heartbeatParticipant = await markBattleHeartbeat({
      battleId,
      userId: user.id,
    });

    return NextResponse.json({
      status: "success",
      battleId,
      presenceStatus: heartbeatParticipant?.presenceStatus ?? null,
      redirectTo: `/battle/${battleId}`,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle reconnect error:", error);

    return jsonError("Failed to reconnect.", 500);
  }
}
