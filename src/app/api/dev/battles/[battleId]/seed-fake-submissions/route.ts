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
import { maybeMoveBattleToVoting } from "@/lib/battle/transitions";
import {
  isPublicR2Url,
  requireRemoteAudioUrlInProduction,
  shouldRequireRemoteAudioUrl,
} from "@/lib/audio-url";
import { prisma } from "@/lib/prisma";
import { battleParamsSchema } from "@/lib/validations/battle";

const fakeUserPrefix = "dev_fake_player_";
const demoFiles = [
  "/demo-audio/demo-loop-1.mp3",
  "/demo-audio/demo-melody-1.mp3",
  "/demo-audio/demo-loop-1.mp3",
  "/demo-audio/demo-melody-1.mp3",
];

async function getFakeSubmissionFiles() {
  if (!shouldRequireRemoteAudioUrl()) {
    return demoFiles.map((fileUrl) => ({
      fileUrl,
      fileName: fileUrl.split("/").pop() ?? "fake-submission.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
    }));
  }

  const sounds = await prisma.soundPackSound.findMany({
    where: {
      soundPack: {
        isActive: true,
      },
      fileUrl: {
        startsWith: process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "https://",
      },
    },
    select: {
      fileUrl: true,
      name: true,
      fileType: true,
      sizeBytes: true,
    },
    orderBy: {
      fileUrl: "asc",
    },
    take: 50,
  });
  const candidates = sounds
    .filter((sound) => isPublicR2Url(sound.fileUrl))
    .map((sound) => ({
      fileUrl: sound.fileUrl,
      fileName: `${sound.name}.mp3`,
      mimeType: "audio/mpeg",
      sizeBytes: sound.sizeBytes ?? 1024,
    }));

  if (candidates.length === 0) {
    console.warn("No R2 fake submission candidates found.", {
      storageProvider: process.env.STORAGE_PROVIDER,
      r2PublicUrlConfigured: Boolean(process.env.R2_PUBLIC_URL),
    });
  }

  return candidates;
}

function isEnabled() {
  return isBattleDevToolsEnabled();
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ battleId: string }> },
) {
  if (!isEnabled()) {
    return NextResponse.json(
      {
        error: getBattleDevToolsDisabledMessage("Dev fake submissions"),
      },
      { status: 403 },
    );
  }

  try {
    const user = await requireCurrentUser();
    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json({ error: "Battle ID is required." }, { status: 400 });
    }

    const { battleId } = parsedParams.data;
    const { battle } = await getBattleParticipantOrThrow(user.id, battleId);

    if (
      battle.status !== BattleStatus.SUBMISSION &&
      battle.status !== BattleStatus.VOTING
    ) {
      return NextResponse.json(
        {
          error:
            "Fake submissions can only be seeded during submission or voting.",
        },
        { status: 400 },
      );
    }

    const fakeParticipants = await prisma.battleParticipant.findMany({
      where: {
        battleId,
        user: {
          username: {
            startsWith: fakeUserPrefix,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        joinedAt: "asc",
      },
    });

    if (fakeParticipants.length === 0) {
      return NextResponse.json(
        { error: "No fake players were found in this battle." },
        { status: 400 },
      );
    }

    const now = new Date();
    const fakeSubmissionFiles = await getFakeSubmissionFiles();

    if (fakeSubmissionFiles.length === 0) {
      return NextResponse.json(
        {
          error:
            "No R2 fake submission audio is available. Run pnpm r2:import-library first.",
        },
        { status: 400 },
      );
    }

    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      for (const [index, participant] of fakeParticipants.entries()) {
        const file = fakeSubmissionFiles[index % fakeSubmissionFiles.length];
        const fileUrl = file.fileUrl;
        const fileName = `${participant.user.username}-${file.fileName}`;
        requireRemoteAudioUrlInProduction(fileUrl, "dev-fake-submission");
        const existingSubmission = await tx.battleSubmission.findUnique({
          where: {
            battleId_participantId: {
              battleId,
              participantId: participant.id,
            },
          },
          select: {
            id: true,
          },
        });

        await tx.battleSubmission.upsert({
          where: {
            battleId_participantId: {
              battleId,
              participantId: participant.id,
            },
          },
          update: {
            fileUrl,
            fileName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          },
          create: {
            battleId,
            participantId: participant.id,
            userId: participant.userId,
            fileUrl,
            fileName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          },
        });

        if (existingSubmission) {
          updated += 1;
        } else {
          created += 1;
        }

        await tx.battleParticipant.update({
          where: {
            id: participant.id,
          },
          data: {
            beatUrl: fileUrl,
            submittedAt: now,
            missedSubmission: false,
            technicalLoss: false,
          },
        });
      }
    });

    await maybeMoveBattleToVoting(battleId);

    return NextResponse.json({ status: "success", created, updated });
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    console.error("Seed fake submissions error:", {
      error,
    });

    return NextResponse.json(
      { error: "Failed to seed fake submissions." },
      { status: 500 },
    );
  }
}
