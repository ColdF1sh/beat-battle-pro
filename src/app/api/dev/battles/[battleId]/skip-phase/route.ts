import { BattleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ApiAccessError,
  getBattleParticipantOrThrow,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  getBattleDevToolsDisabledMessage,
  isBattleDevToolsEnabled,
} from "@/lib/battle/dev-tools";
import { modeRequiresDrafting } from "@/lib/battle/drafting/engine";
import {
  finishBattle,
  seedDevFakeSubmissionsForBattle,
} from "@/lib/battle/transitions";
import {
  ensureBattleAudioSource,
  isRapBattleMode,
  prepareRapBeatForBattle,
} from "@/lib/battle/sound-pack";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema } from "@/lib/validations/battle";

function isEnabled() {
  return isBattleDevToolsEnabled();
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ battleId: string }> },
) {
  if (!isEnabled()) {
    return jsonError(
      getBattleDevToolsDisabledMessage("Dev phase skipping"),
      403,
    );
  }

  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return jsonError("Battle ID is required.", 400);
    }

    const { battleId } = parsedParams.data;
    await getBattleParticipantOrThrow(user.id, battleId);
    const battle = await prisma.battle.findUnique({
      where: { id: battleId },
      select: {
        id: true,
        status: true,
        mode: true,
        durationMinutes: true,
      },
    });

    if (!battle) {
      return jsonError("Battle not found.", 404);
    }
    const from = battle.status;

    if (from === BattleStatus.FINISHED || from === BattleStatus.CANCELLED) {
      return jsonError("This battle cannot skip phases anymore.", 400);
    }

    if (from === BattleStatus.READY) {
      const to = modeRequiresDrafting(battle.mode)
        ? BattleStatus.DRAFTING
        : BattleStatus.ACTIVE;

      if (isRapBattleMode(battle.mode)) {
        await prepareRapBeatForBattle(battle.id);
      }

      await prisma.$transaction(async (tx) => {
        if (to === BattleStatus.DRAFTING) {
          await tx.battle.update({
            where: { id: battle.id },
            data: { status: BattleStatus.DRAFTING },
          });
          await tx.battleDraft.upsert({
            where: { battleId: battle.id },
            update: {},
            create: { battleId: battle.id },
          });
          return;
        }

        const now = new Date();
        await ensureBattleAudioSource(tx, {
          battleId: battle.id,
          modeId: battle.mode,
          allowRapBeatFilesystemScan: false,
        });
        await tx.battle.update({
          where: { id: battle.id },
          data: {
            status: BattleStatus.ACTIVE,
            startedAt: now,
            endsAt: new Date(now.getTime() + battle.durationMinutes * 60 * 1000),
          },
        });
      });

      return NextResponse.json({ status: "success", from, to });
    }

    if (from === BattleStatus.DRAFTING) {
      const now = new Date();
      if (isRapBattleMode(battle.mode)) {
        await prepareRapBeatForBattle(battle.id);
      }

      await prisma.$transaction(async (tx) => {
        await ensureBattleAudioSource(tx, {
          battleId: battle.id,
          modeId: battle.mode,
          allowRapBeatFilesystemScan: false,
        });
        await tx.battle.update({
          where: { id: battle.id },
          data: {
            status: BattleStatus.ACTIVE,
            startedAt: now,
            endsAt: new Date(now.getTime() + battle.durationMinutes * 60 * 1000),
          },
        });
      });

      return NextResponse.json({
        status: "success",
        from,
        to: BattleStatus.ACTIVE,
      });
    }

    if (from === BattleStatus.ACTIVE) {
      const now = new Date();
      await prisma.battle.update({
        where: { id: battle.id },
        data: {
          status: BattleStatus.SUBMISSION,
          submissionStartedAt: now,
          submissionEndsAt: new Date(now.getTime() + 60 * 1000),
        },
      });
      await seedDevFakeSubmissionsForBattle(battle.id);

      return NextResponse.json({
        status: "success",
        from,
        to: BattleStatus.SUBMISSION,
      });
    }

    if (from === BattleStatus.SUBMISSION) {
      const participants = await prisma.battleParticipant.findMany({
        where: { battleId: battle.id },
        select: {
          id: true,
          submission: { select: { id: true } },
        },
      });
      const missingParticipantIds = participants
        .filter((participant) => !participant.submission)
        .map((participant) => participant.id);

      await prisma.$transaction([
        prisma.battleParticipant.updateMany({
          where: {
            battleId: battle.id,
            id: { in: missingParticipantIds },
          },
          data: {
            missedSubmission: true,
            technicalLoss: true,
          },
        }),
        prisma.battle.update({
          where: { id: battle.id },
          data: {
            status: BattleStatus.VOTING,
            votingStartedAt: null,
            votingEndsAt: null,
          },
        }),
      ]);

      return NextResponse.json({
        status: "success",
        from,
        to: BattleStatus.VOTING,
      });
    }

    if (from === BattleStatus.VOTING) {
      await finishBattle(battle.id);

      return NextResponse.json({
        status: "success",
        from,
        to: BattleStatus.FINISHED,
      });
    }

    return jsonError("This phase cannot be skipped.", 400);
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Dev skip phase error:", error);

    return jsonError("Failed to skip battle phase.", 500);
  }
}
