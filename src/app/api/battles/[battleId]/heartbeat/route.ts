import { NextResponse } from "next/server";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { markBattleHeartbeat } from "@/lib/battle/competitive-lifecycle";
import { battleParamsSchema } from "@/lib/validations/battle";

type HeartbeatRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: HeartbeatRouteProps,
) {
  const startedAt = Date.now();

  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;

    const participant = await markBattleHeartbeat({
      battleId,
      userId: user.id,
    });

    if (!participant) {
      return jsonError("Battle participant not found.", 404);
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug("heartbeat timing", {
        battleId,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return NextResponse.json({
      status: "success",
      presenceStatus: participant?.presenceStatus ?? null,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle heartbeat error:", {
      error,
      elapsedMs: Date.now() - startedAt,
    });

    return jsonError("Failed to update heartbeat.", 500);
  }
}
