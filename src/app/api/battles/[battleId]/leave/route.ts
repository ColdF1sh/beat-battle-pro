import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { abandonBattleParticipant } from "@/lib/battle/competitive-lifecycle";
import { battleParamsSchema } from "@/lib/validations/battle";

type LeaveRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_request: Request, { params }: LeaveRouteProps) {
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
      reason: "LEGACY_LEAVE",
    });

    return NextResponse.json({
      status: "abandoned",
      applied: result?.applied ?? false,
      penalty: result?.penalty ?? 0,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle leave error:", error);

    return jsonError("Failed to leave battle.", 500);
  }
}
