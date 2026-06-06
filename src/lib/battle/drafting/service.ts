import { BattleStatus, type Prisma } from "@prisma/client";

import {
  DRAFT_TURN_SECONDS,
  draftCategories,
  draftCategoryIds,
  getDraftCategory,
} from "@/lib/battle/drafting/config";
import {
  buildDraftSnapshot,
  getCurrentDraftTurn,
  getRequiredBanCountForTurn,
  type DraftBan,
  type DraftParticipant,
  type DraftSnapshot,
} from "@/lib/battle/drafting/engine";
import { ensureBattleAudioSource } from "@/lib/battle/sound-pack";
import { prisma } from "@/lib/prisma";

export class DraftingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DraftingError";
    this.status = status;
  }
}

const fakeUserPrefix = "dev_fake_player_";
const fakeDraftDelayMs = 900;
const maxAutoAdvancesPerRequest = 20;

function toDraftParticipants(
  participants: Array<{
    id: string;
    userId: string;
    user: {
      username: string;
    };
  }>,
) {
  return participants.map((participant) => ({
    id: participant.id,
    userId: participant.userId,
    username: participant.user.username,
  })) satisfies DraftParticipant[];
}

function toDraftBans(
  bans: Array<{
    id: string;
    category: string;
    option: string;
    participantId: string;
    userId: string;
    turnIndex: number;
    createdAt: Date;
  }>,
) {
  return bans.map((ban) => ({
    id: ban.id,
    category: ban.category,
    option: ban.option,
    participantId: ban.participantId,
    userId: ban.userId,
    turnIndex: ban.turnIndex,
    createdAt: ban.createdAt,
  })) satisfies DraftBan[];
}

async function loadBattleDraft(
  client: Prisma.TransactionClient,
  battleId: string,
  options: {
    allowCompleted?: boolean;
  } = {},
) {
  const battle = await client.battle.findUnique({
    where: {
      id: battleId,
    },
    include: {
      participants: {
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          joinedAt: "asc",
        },
      },
      draft: {
        include: {
          bans: {
            orderBy: {
              turnIndex: "asc",
            },
          },
        },
      },
    },
  });

  if (!battle) {
    throw new DraftingError("Battle not found.", 404);
  }

  const isCompletedDraftVisible =
    options.allowCompleted &&
    battle.draft?.status === "COMPLETED" &&
    battle.status !== BattleStatus.CANCELLED;

  if (battle.status !== BattleStatus.DRAFTING && !isCompletedDraftVisible) {
    throw new DraftingError("Drafting is not open for this battle.", 400);
  }

  const draft =
    battle.draft ??
    (await client.battleDraft.create({
      data: {
        battleId,
        currentCategory: draftCategoryIds[0],
      },
      include: {
        bans: true,
      },
    }));

  return {
    battle,
    draft,
    participants: toDraftParticipants(battle.participants),
    bans: toDraftBans(draft.bans),
  };
}

export async function getBattleDraftState(battleId: string) {
  const advancedSnapshot = await advanceDraftIfNeeded(battleId);

  if (advancedSnapshot?.status === "COMPLETED") {
    return advancedSnapshot;
  }

  return prisma.$transaction(async (tx) => {
    const { draft, participants, bans } = await loadBattleDraft(tx, battleId, {
      allowCompleted: true,
    });

    return buildDraftSnapshot({
      participants,
      bans,
      turnStartedAt: draft.turnStartedAt,
    });
  });
}

function getAvailableOptions(categoryId: string, bans: DraftBan[]) {
  const category = draftCategories.find((item) => item.id === categoryId);

  if (!category) {
    throw new DraftingError("Invalid draft category.", 400);
  }

  const bannedOptions = new Set(
    bans.filter((ban) => ban.category === categoryId).map((ban) => ban.option),
  );
  const availableOptions = category.options.filter(
    (option) => !bannedOptions.has(option),
  );

  return availableOptions;
}

function pickRandomAvailableOptions(categoryId: string, bans: DraftBan[], count: number) {
  const availableOptions = getAvailableOptions(categoryId, bans);

  if (availableOptions.length <= 1) {
    throw new DraftingError("No draft options are available.", 409);
  }

  return [...availableOptions]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, availableOptions.length - 1));
}

function isFakeDraftParticipant(participant: DraftParticipant | null) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_FAKE_PLAYERS === "true" &&
    Boolean(participant?.username.startsWith(fakeUserPrefix))
  );
}

async function completeDraftIfNeeded(
  tx: Prisma.TransactionClient,
  params: {
    battle: Awaited<ReturnType<typeof loadBattleDraft>>["battle"];
    draftId: string;
    snapshot: DraftSnapshot;
    now: Date;
  },
) {
  if (params.snapshot.status !== "COMPLETED") {
    await tx.battleDraft.update({
      where: {
        id: params.draftId,
      },
      data: {
        currentCategory: params.snapshot.currentCategory ?? "complete",
        currentTurnIndex: params.snapshot.turnIndex,
        turnStartedAt: params.now,
      },
    });

    return params.snapshot;
  }

  const durationMinutes = params.snapshot.finalRules.durationMinutes ?? 20;
  await ensureBattleAudioSource(tx, {
    battleId: params.battle.id,
    modeId: params.battle.mode,
    allowRapBeatFilesystemScan: false,
  });

  await tx.battleDraft.update({
    where: {
      id: params.draftId,
    },
    data: {
      status: "COMPLETED",
      currentCategory: "complete",
      currentTurnIndex: params.snapshot.turnIndex,
      finalGenre: params.snapshot.finalRules.genre,
      finalBpm: params.snapshot.finalRules.bpm,
      finalKey: params.snapshot.finalRules.key,
      finalDurationMinutes: durationMinutes,
      turnStartedAt: params.now,
    },
  });

  await tx.battle.update({
    where: {
      id: params.battle.id,
    },
    data: {
      status: BattleStatus.ACTIVE,
      durationMinutes,
      startedAt: params.now,
      endsAt: new Date(params.now.getTime() + durationMinutes * 60 * 1000),
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.debug("draft battle started", {
      battleId: params.battle.id,
      durationMinutes,
    });
  }

  return {
    ...params.snapshot,
    turnStartedAt: params.now,
  };
}

async function applyDraftBan(
  tx: Prisma.TransactionClient,
  params: {
    battleId: string;
    participantUserId: string;
    category: string;
    options: string[];
  },
) {
  const { battle, draft, participants, bans } = await loadBattleDraft(
    tx,
    params.battleId,
  );
  const category = getDraftCategory(params.category);

  const requestedOptions = [...new Set(params.options)];

  if (
    !category ||
    requestedOptions.length === 0 ||
    requestedOptions.some((option) => !category.options.includes(option))
  ) {
    throw new DraftingError("Invalid draft option.", 400);
  }

  const participant = participants.find(
    (item) => item.userId === params.participantUserId,
  );

  if (!participant) {
    throw new DraftingError("You are not a participant in this battle.", 403);
  }

  const turn = getCurrentDraftTurn(participants, bans);

  if (!turn.category || !turn.currentParticipant) {
    const now = new Date();
    const snapshot = buildDraftSnapshot({
      participants,
      bans,
      turnStartedAt: now,
    });

    return completeDraftIfNeeded(tx, {
      battle,
      draftId: draft.id,
      snapshot,
      now,
    });
  }

  if (turn.category.id !== category.id) {
    throw new DraftingError("That category is not active right now.", 400);
  }

  if (turn.currentParticipant.userId !== params.participantUserId) {
    throw new DraftingError("It is not your turn to ban.", 403);
  }

  const availableOptions = getAvailableOptions(category.id, bans);
  const requiredBanCount = getRequiredBanCountForTurn({
    categoryId: category.id,
    participants,
    currentParticipant: turn.currentParticipant,
    availableOptionCount: availableOptions.length,
  });

  if (availableOptions.length <= 1) {
    return buildDraftSnapshot({
      participants,
      bans,
      turnStartedAt: draft.turnStartedAt,
    });
  }

  if (requestedOptions.length !== requiredBanCount) {
    throw new DraftingError(
      requiredBanCount === 1 ? "Select one option to ban." : `Select ${requiredBanCount} options to ban.`,
      400,
    );
  }

  if (requestedOptions.some((option) => !availableOptions.includes(option))) {
    const existingBan = bans.find(
      (ban) =>
        ban.category === params.category && requestedOptions.includes(ban.option),
    );

    if (existingBan) {
      return buildDraftSnapshot({
        participants,
        bans,
        turnStartedAt: draft.turnStartedAt,
      });
    }

    throw new DraftingError("One or more options are not available.", 409);
  }

  try {
    await tx.battleDraftBan.createMany({
      data: requestedOptions.map((option) => ({
        draftId: draft.id,
        battleId: battle.id,
        category: category.id,
        option,
        participantId: participant.id,
        userId: participant.userId,
        turnIndex: turn.turnIndex,
      })),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const currentDraft = await tx.battleDraft.findUniqueOrThrow({
        where: {
          id: draft.id,
        },
        include: {
          bans: {
            orderBy: {
              turnIndex: "asc",
            },
          },
        },
      });

      return buildDraftSnapshot({
        participants,
        bans: toDraftBans(currentDraft.bans),
        turnStartedAt: currentDraft.turnStartedAt,
      });
    }

    throw error;
  }

  const updatedDraft = await tx.battleDraft.findUniqueOrThrow({
    where: {
      id: draft.id,
    },
    include: {
      bans: {
        orderBy: {
          turnIndex: "asc",
        },
      },
    },
  });
  const updatedBans = toDraftBans(updatedDraft.bans);
  const now = new Date();
  const snapshot = buildDraftSnapshot({
    participants,
    bans: updatedBans,
    turnStartedAt: now,
  });

  if (process.env.NODE_ENV !== "production") {
    console.debug("draft ban submitted", {
      battleId: battle.id,
      category: category.id,
      options: requestedOptions,
      username: participant.username,
    });

    const completedCategory = snapshot.categories.find(
      (item) => item.id === category.id,
    );

    if (completedCategory?.isComplete) {
      console.debug("draft category resolved", {
        battleId: battle.id,
        category: category.id,
        finalOption: completedCategory.finalOption,
      });
    }
  }

  return completeDraftIfNeeded(tx, {
    battle,
    draftId: draft.id,
    snapshot,
    now,
  });
}

export async function banDraftOption(params: {
  battleId: string;
  userId: string;
  category: string;
  options: string[];
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      return applyDraftBan(tx, {
        battleId: params.battleId,
        participantUserId: params.userId,
        category: params.category,
        options: params.options,
      });
    });
  } catch (error) {
    if (
      error instanceof DraftingError &&
      error.message === "Drafting is not open for this battle."
    ) {
      return prisma.$transaction(async (tx) => {
        const { draft, participants, bans } = await loadBattleDraft(
          tx,
          params.battleId,
          {
            allowCompleted: true,
          },
        );

        return buildDraftSnapshot({
          participants,
          bans,
          turnStartedAt: draft.turnStartedAt,
        });
      });
    }

    throw error;
  }
}

export async function advanceDraftIfNeeded(battleId: string) {
  let lastSnapshot: DraftSnapshot | null = null;
  let autoAdvanceCount = 0;

  for (let count = 0; count < maxAutoAdvancesPerRequest; count += 1) {
    const result = await prisma.$transaction(async (tx) => {
      const { draft, participants, bans } = await loadBattleDraft(tx, battleId, {
        allowCompleted: true,
      });
      const snapshot = buildDraftSnapshot({
        participants,
        bans,
        turnStartedAt: draft.turnStartedAt,
      });

      if (
        snapshot.status !== "ACTIVE" ||
        !snapshot.currentCategory ||
        !snapshot.currentParticipant
      ) {
        return { advanced: false, snapshot };
      }

      const elapsedMs = Date.now() - draft.turnStartedAt.getTime();
      const shouldAutoBanFake =
        isFakeDraftParticipant(snapshot.currentParticipant) &&
        elapsedMs >= fakeDraftDelayMs;
      const shouldAutoBanExpired = elapsedMs >= DRAFT_TURN_SECONDS * 1000;

      if (!shouldAutoBanFake && !shouldAutoBanExpired) {
        return { advanced: false, snapshot };
      }

      const availableOptions = getAvailableOptions(snapshot.currentCategory, bans);
      const requiredBanCount = getRequiredBanCountForTurn({
        categoryId: snapshot.currentCategory,
        participants,
        currentParticipant: snapshot.currentParticipant,
        availableOptionCount: availableOptions.length,
      });

      if (availableOptions.length <= 1) {
        const now = new Date();
        const completedSnapshot = buildDraftSnapshot({
          participants,
          bans,
          turnStartedAt: now,
        });

        return {
          advanced: false,
          snapshot: await completeDraftIfNeeded(tx, {
            battle: (await loadBattleDraft(tx, battleId, {
              allowCompleted: true,
            })).battle,
            draftId: draft.id,
            snapshot: completedSnapshot,
            now,
          }),
        };
      }

      return {
        advanced: true,
        snapshot: await applyDraftBan(tx, {
          battleId,
          participantUserId: snapshot.currentParticipant.userId,
          category: snapshot.currentCategory,
          options: pickRandomAvailableOptions(
            snapshot.currentCategory,
            bans,
            requiredBanCount,
          ),
        }),
      };
    });

    lastSnapshot = result.snapshot;

    if (!result.advanced) {
      break;
    }

    autoAdvanceCount += 1;

    if (result.snapshot.status === "COMPLETED") {
      break;
    }
  }

  if (autoAdvanceCount >= maxAutoAdvancesPerRequest) {
    throw new DraftingError("Draft auto-advance safety limit reached.", 500);
  }

  if (process.env.NODE_ENV !== "production" && autoAdvanceCount > 0) {
    console.debug("draft auto-advance count", {
      battleId,
      autoAdvanceCount,
    });
  }

  return lastSnapshot;
}
