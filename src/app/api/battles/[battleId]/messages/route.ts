import { NextResponse } from "next/server";
import { z } from "zod";
import { BattleParticipantPresence } from "@prisma/client";

import {
  ApiAccessError,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { validateJsonBody } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema } from "@/lib/validations/battle";

type MessagesRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

const messageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(500, "Message must be 500 characters or fewer."),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function parseBattleId(params: MessagesRouteProps["params"]) {
  const parsedParams = battleParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    throw new ApiAccessError("Battle ID is required.", 400);
  }

  return parsedParams.data.battleId;
}

async function getMessageParticipant(userId: string, battleId: string) {
  const participant = await prisma.battleParticipant.findUnique({
    where: {
      battleId_userId: {
        battleId,
        userId,
      },
    },
    select: {
      id: true,
      presenceStatus: true,
    },
  });

  if (!participant) {
    throw new ApiAccessError("You do not have access to this battle.", 403);
  }

  return participant;
}

export async function GET(_request: Request, { params }: MessagesRouteProps) {
  const startedAt = Date.now();
  try {
    const user = await requireCurrentUser();
    const battleId = await parseBattleId(params);

    await getMessageParticipant(user.id, battleId);

    const messages = await prisma.battleMessage.findMany({
      where: {
        battleId,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("messages API timing", {
        battleId,
        count: messages.length,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle messages load error:", {
      error,
      elapsedMs: Date.now() - startedAt,
    });

    return jsonError("Failed to load messages.", 500);
  }
}

export async function POST(request: Request, { params }: MessagesRouteProps) {
  const startedAt = Date.now();
  try {
    const user = await requireCurrentUser();
    const battleId = await parseBattleId(params);

    const participant = await getMessageParticipant(user.id, battleId);

    if (participant.presenceStatus === BattleParticipantPresence.ABANDONED) {
      return jsonError("You abandoned this battle and cannot send messages.", 403);
    }

    const parsedBody = await validateJsonBody(request, messageSchema);

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const message = await prisma.battleMessage.create({
      data: {
        battleId,
        userId: user.id,
        content: parsedBody.data.content,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (process.env.NODE_ENV !== "production") {
      console.debug("message send timing", {
        battleId,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Battle message send error:", {
      error,
      elapsedMs: Date.now() - startedAt,
    });

    return jsonError("Failed to send message.", 500);
  }
}
