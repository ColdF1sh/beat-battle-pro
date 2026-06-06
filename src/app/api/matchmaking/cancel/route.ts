import { MatchmakingQueueStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  rateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/api/rate-limit";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const limit = rateLimit(request, {
    route: "matchmaking:cancel",
    windowMs: 60 * 1000,
    maxRequests: 30,
  });

  if (!limit.allowed) {
    return rateLimitResponse(limit);
  }

  try {
    const user = await requireCurrentUser();

    await prisma.matchmakingQueue.deleteMany({
      where: {
        userId: user.id,
        status: MatchmakingQueueStatus.SEARCHING,
      },
    });

    return withRateLimitHeaders(
      NextResponse.json({
        status: "cancelled",
      }),
      limit,
    );
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return withRateLimitHeaders(jsonAccessError(error), limit);
    }

    console.error("Matchmaking cancel error:", error);

    return NextResponse.json(
      { error: "Something went wrong while cancelling matchmaking." },
      { status: 500 },
    );
  }
}
