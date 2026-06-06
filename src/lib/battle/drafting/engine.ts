import { battleModes } from "@/lib/battle/modes";
import {
  draftCategories,
  type DraftCategoryId,
  parseDurationOption,
} from "@/lib/battle/drafting/config";

export type DraftParticipant = {
  id: string;
  userId: string;
  username: string;
};

export type DraftBan = {
  id?: string;
  category: string;
  option: string;
  participantId: string;
  userId: string;
  turnIndex: number;
  createdAt?: Date | string;
};

export type DraftRules = {
  genre: string | null;
  bpm: string | null;
  key: string | null;
  duration: string | null;
  durationMinutes: number | null;
};

export type DraftSnapshot = {
  status: "ACTIVE" | "COMPLETED";
  categories: Array<{
    id: DraftCategoryId;
    label: string;
    options: Array<{
      value: string;
      isBanned: boolean;
      bannedBy: string | null;
    }>;
    finalOption: string | null;
    isComplete: boolean;
  }>;
  currentCategory: DraftCategoryId | null;
  currentParticipant: DraftParticipant | null;
  currentRequiredBanCount: number;
  turnIndex: number;
  turnStartedAt: Date | string | null;
  finalRules: DraftRules;
  latestBanEvent: DraftBanEvent | null;
};

export type DraftBanEvent = {
  id: string;
  category: string;
  option: string;
  username: string;
  turnIndex: number;
  createdAt: Date | string;
};

export function modeRequiresDrafting(modeId: string) {
  return battleModes.some(
    (mode) => mode.id === modeId && mode.requiresDrafting,
  );
}

function rotateParticipants(participants: DraftParticipant[], categoryIndex: number) {
  if (participants.length === 0) {
    return [];
  }

  const offset = categoryIndex % participants.length;

  return [...participants.slice(offset), ...participants.slice(0, offset)];
}

function getCategoryRemainingOptions(categoryId: string, bans: DraftBan[]) {
  const category = draftCategories.find((item) => item.id === categoryId);

  if (!category) {
    return [];
  }

  const bannedOptions = new Set(
    bans
      .filter((ban) => ban.category === categoryId)
      .map((ban) => ban.option),
  );

  return category.options.filter((option) => !bannedOptions.has(option));
}

function getCategoryTurnCount(categoryId: string, bans: DraftBan[]) {
  const turnIndexes = new Set(
    bans
      .filter((ban) => ban.category === categoryId)
      .map((ban) => ban.turnIndex),
  );

  return turnIndexes.size;
}

function getNextTurnIndex(bans: DraftBan[]) {
  if (bans.length === 0) {
    return 0;
  }

  return Math.max(...bans.map((ban) => ban.turnIndex)) + 1;
}

export function getRequiredBanCountForTurn(params: {
  categoryId: string;
  participants: DraftParticipant[];
  currentParticipant: DraftParticipant | null;
  availableOptionCount: number;
}) {
  const { categoryId, participants, currentParticipant, availableOptionCount } =
    params;

  if (availableOptionCount <= 1 || !currentParticipant) {
    return 0;
  }

  if (categoryId !== "key") {
    return 1;
  }

  const isLastParticipant =
    participants.length > 0 &&
    participants[participants.length - 1]?.id === currentParticipant.id;
  const desiredCount = isLastParticipant ? 1 : 2;

  return Math.min(desiredCount, availableOptionCount - 1);
}

export function getCurrentDraftTurn(
  participants: DraftParticipant[],
  bans: DraftBan[],
) {
  for (const [categoryIndex, category] of draftCategories.entries()) {
    const remainingOptions = getCategoryRemainingOptions(category.id, bans);

    if (remainingOptions.length <= 1) {
      continue;
    }

    const turns = rotateParticipants(participants, categoryIndex);
    const categoryTurnCount = getCategoryTurnCount(category.id, bans);
    const currentParticipant =
      turns.length > 0 ? turns[categoryTurnCount % turns.length] : null;

    return {
      category,
      currentParticipant,
      turnIndex: getNextTurnIndex(bans),
    };
  }

  return {
    category: null,
    currentParticipant: null,
    turnIndex: getNextTurnIndex(bans),
  };
}

export function buildDraftSnapshot(params: {
  participants: DraftParticipant[];
  bans: DraftBan[];
  turnStartedAt: Date | string | null;
}) {
  const { participants, bans, turnStartedAt } = params;
  const turn = getCurrentDraftTurn(participants, bans);
  const banByCategoryAndOption = new Map(
    bans.map((ban) => [`${ban.category}:${ban.option}`, ban]),
  );

  const categories = draftCategories.map((category) => {
    const remainingOptions = getCategoryRemainingOptions(category.id, bans);
    const finalOption =
      remainingOptions.length === 1 ? remainingOptions[0] : null;

    return {
      id: category.id,
      label: category.label,
      options: category.options.map((option) => {
        const ban = banByCategoryAndOption.get(`${category.id}:${option}`);
        const bannedBy = ban
          ? participants.find((participant) => participant.id === ban.participantId)
              ?.username ?? "Producer"
          : null;

        return {
          value: option,
          isBanned: Boolean(ban),
          bannedBy,
        };
      }),
      finalOption,
      isComplete: Boolean(finalOption),
    };
  });

  const finalGenre =
    categories.find((category) => category.id === "genre")?.finalOption ?? null;
  const finalBpm =
    categories.find((category) => category.id === "bpm")?.finalOption ?? null;
  const finalKey =
    categories.find((category) => category.id === "key")?.finalOption ?? null;
  const finalDuration =
    categories.find((category) => category.id === "duration")?.finalOption ??
    null;
  const isComplete = categories.every((category) => category.isComplete);
  const latestBan = [...bans].sort((firstBan, secondBan) => {
    if (firstBan.turnIndex !== secondBan.turnIndex) {
      return secondBan.turnIndex - firstBan.turnIndex;
    }

    return new Date(secondBan.createdAt ?? 0).getTime() -
      new Date(firstBan.createdAt ?? 0).getTime();
  })[0];
  const latestBanParticipant = latestBan
    ? participants.find((participant) => participant.id === latestBan.participantId)
    : null;

  return {
    status: isComplete ? "COMPLETED" : "ACTIVE",
    categories,
    currentCategory: turn.category?.id ?? null,
    currentParticipant: turn.currentParticipant,
    currentRequiredBanCount:
      turn.category && turn.currentParticipant
        ? getRequiredBanCountForTurn({
            categoryId: turn.category.id,
            participants: rotateParticipants(
              participants,
              draftCategories.findIndex((category) => category.id === turn.category?.id),
            ),
            currentParticipant: turn.currentParticipant,
            availableOptionCount: getCategoryRemainingOptions(turn.category.id, bans)
              .length,
          })
        : 0,
    turnIndex: turn.turnIndex,
    turnStartedAt,
    finalRules: {
      genre: finalGenre,
      bpm: finalBpm,
      key: finalKey,
      duration: finalDuration,
      durationMinutes: finalDuration
        ? parseDurationOption(finalDuration)
        : null,
    },
    latestBanEvent: latestBan
      ? {
          id: latestBan.id ?? `${latestBan.category}:${latestBan.option}`,
          category: latestBan.category,
          option: latestBan.option,
          username: latestBanParticipant?.username ?? "Producer",
          turnIndex: latestBan.turnIndex,
          createdAt: latestBan.createdAt ?? new Date(0),
        }
      : null,
  } satisfies DraftSnapshot;
}
