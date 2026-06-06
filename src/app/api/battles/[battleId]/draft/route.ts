import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ApiAccessError,
  assertCanViewBattle,
  jsonAccessError,
  requireCurrentUser,
} from "@/lib/api/access-control";
import { validateJsonBody } from "@/lib/api/validation";
import {
  advanceDraftIfNeeded,
  banDraftOption,
  DraftingError,
  getBattleDraftState,
} from "@/lib/battle/drafting/service";
import { battleParamsSchema } from "@/lib/validations/battle";

type BattleDraftRouteProps = {
  params: Promise<{
    battleId: string;
  }>;
};

const draftBanSchema = z.object({
  category: z.string().min(1, "Draft category is required."),
  option: z.string().min(1, "Draft option is required.").optional(),
  options: z.array(z.string().min(1)).optional(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function parseBattleId(params: BattleDraftRouteProps["params"]) {
  const parsedParams = battleParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    throw new DraftingError("Battle ID is required.", 400);
  }

  return parsedParams.data.battleId;
}

export async function GET(_request: Request, { params }: BattleDraftRouteProps) {
  try {
    const user = await requireCurrentUser();
    const battleId = await parseBattleId(params);

    await assertCanViewBattle(user.id, battleId);

    return NextResponse.json(await getBattleDraftState(battleId));
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    if (error instanceof DraftingError) {
      return jsonError(error.message, error.status);
    }

    console.error("Battle draft state error:", error);

    return jsonError("Failed to load draft state.", 500);
  }
}

export async function POST(request: Request, { params }: BattleDraftRouteProps) {
  try {
    const user = await requireCurrentUser();
    const battleId = await parseBattleId(params);

    await assertCanViewBattle(user.id, battleId);

    const parsedBody = await validateJsonBody(request, draftBanSchema);

    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const requestedOptions =
      parsedBody.data.options ?? (parsedBody.data.option ? [parsedBody.data.option] : []);

    const advancedSnapshot = await advanceDraftIfNeeded(battleId);

    if (
      advancedSnapshot?.status === "COMPLETED" ||
      (advancedSnapshot &&
        (advancedSnapshot.currentCategory !== parsedBody.data.category ||
          advancedSnapshot.currentParticipant?.userId !== user.id)) ||
      (advancedSnapshot?.latestBanEvent &&
        advancedSnapshot.latestBanEvent.category === parsedBody.data.category &&
        requestedOptions.includes(advancedSnapshot.latestBanEvent.option))
    ) {
      return NextResponse.json(advancedSnapshot);
    }

    const snapshot = await banDraftOption({
      battleId,
      userId: user.id,
      category: parsedBody.data.category,
      options: requestedOptions,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof ApiAccessError) {
      return jsonAccessError(error);
    }

    if (error instanceof DraftingError) {
      return jsonError(error.message, error.status);
    }

    console.error("Battle draft ban error:", error);

    return jsonError("Failed to submit draft ban.", 500);
  }
}
