import { NextResponse } from "next/server";

import {
  ApiAccessError,
  assertCanSubmitToBattle,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import {
  rateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/api/rate-limit";
import { jsonValidationError } from "@/lib/api/validation";
import { analyzeAndCacheBattleSubmission } from "@/lib/audio-analysis";
import { maybeMoveBattleToVoting } from "@/lib/battle/transitions";
import { prisma } from "@/lib/prisma";
import {
  StorageNotConfiguredError,
  uploadAudioSubmission,
} from "@/lib/storage/s3";
import { battleParamsSchema } from "@/lib/validations/battle";
import { validateAudioUploadFile } from "@/lib/validations/upload";

type BattleSubmissionRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

const loggedSubmissionAnalysisFailures = new Set<string>();

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  { params }: BattleSubmissionRouteProps,
) {
  const limit = rateLimit(request, {
    route: "battle:submission",
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
  });

  if (!limit.allowed) {
    return rateLimitResponse(limit);
  }

  try {
    const user = await requireCurrentUser();

    const parsedParams = battleParamsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return withRateLimitHeaders(
        jsonValidationError([
          {
            field: "battleId",
            message: "Battle ID is required.",
          },
        ]),
        limit,
      );
    }

    const { battleId } = parsedParams.data;
    const { battle, participant } = await assertCanSubmitToBattle(
      user.id,
      battleId,
    );

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return withRateLimitHeaders(
        jsonValidationError([
          {
            field: "file",
            message: "Please upload an audio file using the file field.",
          },
        ]),
        limit,
      );
    }

    const fileValidation = validateAudioUploadFile(file);

    if (!fileValidation.success) {
      return withRateLimitHeaders(
        jsonValidationError([
          {
            field: "file",
            message: fileValidation.message,
          },
        ]),
        limit,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileUrl } = await uploadAudioSubmission({
      battleId: battle.id,
      userId: user.id,
      fileName: file.name,
      mimeType: file.type,
      buffer,
    });
    const submittedAt = new Date();

    const submission = await prisma.$transaction(async (tx) => {
      const savedSubmission = await tx.battleSubmission.upsert({
        where: {
          battleId_participantId: {
            battleId: battle.id,
            participantId: participant.id,
          },
        },
        update: {
          userId: user.id,
          fileUrl,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
        create: {
          battleId: battle.id,
          userId: user.id,
          participantId: participant.id,
          fileUrl,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
        select: {
          id: true,
          fileUrl: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      });

      await tx.battleParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          beatUrl: fileUrl,
          submittedAt,
        },
      });

      return savedSubmission;
    });

    await maybeMoveBattleToVoting(battle.id);
    void analyzeAndCacheBattleSubmission(prisma, submission.id).catch((error) => {
      if (!loggedSubmissionAnalysisFailures.has(submission.id)) {
        loggedSubmissionAnalysisFailures.add(submission.id);
        console.warn(`Submission analysis failed for ${submission.id}`, error);
      }
    });

    return withRateLimitHeaders(
      NextResponse.json({
        status: "success",
        submission,
      }),
      limit,
    );
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return withRateLimitHeaders(jsonAccessError(error), limit);
    }

    if (error instanceof StorageNotConfiguredError) {
      return withRateLimitHeaders(
        jsonError("Storage is not configured.", 500),
        limit,
      );
    }

    console.error("Submission upload validation error:", error);

    return withRateLimitHeaders(
      jsonError("Failed to validate audio submission.", 500),
      limit,
    );
  }
}
