import { BattleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export class ApiAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiAccessError";
    this.status = status;
  }
}

export function jsonAccessError(error: ApiAccessError) {
  return NextResponse.json(
    {
      error: error.message,
    },
    {
      status: error.status,
    },
  );
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiAccessError("Unauthorized", 401);
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!existingUser) {
    throw new ApiAccessError(
      "Your session is no longer valid. Please log in again.",
      401,
    );
  }

  return user;
}

export async function getBattleParticipantOrThrow(
  userId: string,
  battleId: string,
) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      status: true,
      votingStartedAt: true,
      votingEndsAt: true,
      participants: {
        where: {
          userId,
        },
        select: {
          id: true,
          userId: true,
          presenceStatus: true,
        },
      },
    },
  });

  if (!battle) {
    throw new ApiAccessError("Battle not found.", 404);
  }

  const participant = battle.participants[0];

  if (!participant) {
    throw new ApiAccessError(
      "You are not a participant in this battle.",
      403,
    );
  }

  return {
    battle,
    participant,
  };
}

export async function requireBattleParticipant(
  userId: string,
  battleId: string,
) {
  await getBattleParticipantOrThrow(userId, battleId);
}

export async function assertCanViewBattle(userId: string, battleId: string) {
  return getBattleParticipantOrThrow(userId, battleId);
}

export async function assertCanSubmitToBattle(
  userId: string,
  battleId: string,
) {
  const access = await getBattleParticipantOrThrow(userId, battleId);

  if (access.participant.presenceStatus === "ABANDONED") {
    throw new ApiAccessError(
      "You abandoned this battle and cannot submit.",
      403,
    );
  }

  if (access.battle.status !== BattleStatus.SUBMISSION) {
    throw new ApiAccessError(
      "Submissions are not open for this battle.",
      400,
    );
  }

  return access;
}

export async function assertCanVoteInBattle(userId: string, battleId: string) {
  const access = await getBattleParticipantOrThrow(userId, battleId);

  if (access.participant.presenceStatus === "ABANDONED") {
    throw new ApiAccessError(
      "You abandoned this battle and cannot vote.",
      403,
    );
  }

  if (access.battle.status !== BattleStatus.VOTING) {
    throw new ApiAccessError("Voting is not open for this battle.", 400);
  }

  return access;
}
