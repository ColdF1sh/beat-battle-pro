import { BattleStatus } from "@prisma/client";
import {
  Disc3Icon,
  DownloadIcon,
  FileAudioIcon,
  LockIcon,
  ShieldAlertIcon,
  UsersIcon,
  VoteIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SubmissionAudioPlayer } from "@/components/audio/submission-audio-player";
import { BattleTimer } from "@/components/battle/battle-timer";
import { BattleChatPanel } from "@/components/battle/battle-chat-panel";
import { BattleHeartbeat } from "@/components/battle/battle-heartbeat";
import { BattleNavigationGuard } from "@/components/battle/battle-navigation-guard";
import { BattleVolumeControl } from "@/components/battle/battle-volume-control";
import { DevSeedFakeSubmissionsButton } from "@/components/battle/dev-seed-fake-submissions-button";
import { DevFakeVotingButton } from "@/components/battle/dev-fake-voting-button";
import { DevSkipPhaseButton } from "@/components/battle/dev-skip-phase-button";
import { BattleStatusSync } from "@/components/battle/battle-status-sync";
import { DraftingPanel } from "@/components/battle/drafting-panel";
import { LeaveBattleButton } from "@/components/battle/leave-battle-button";
import { ReadyCheckPanel } from "@/components/battle/ready-check-panel";
import { RapBeatAnalysisRefresh } from "@/components/battle/rap-beat-analysis-refresh";
import { ReturnToLobbyButton } from "@/components/battle/return-to-lobby-button";
import { SubmissionUploadForm } from "@/components/battle/submission-upload-form";
import { VotingPanel } from "@/components/battle/voting-panel";
import { ProducerHoverCard } from "@/components/profile/producer-hover-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { isBattleDevToolsEnabled } from "@/lib/battle/dev-tools";
import { getBattleDraftState } from "@/lib/battle/drafting/service";
import { modeRequiresDrafting } from "@/lib/battle/drafting/engine";
import { battleModes } from "@/lib/battle/modes";
import {
  isRapBattleMode,
  prepareRapBeatForBattle,
} from "@/lib/battle/sound-pack";
import {
  battleStatusDetails,
  canSubmit,
  canVote,
  getBattleStatusBadgeClassName,
  getBattleStatusLabel,
} from "@/lib/battle/status";
import { prisma } from "@/lib/prisma";
import {
  getPresenceColorClass,
  PresenceStatus,
} from "@/lib/presence/status";
import {
  getProducerRankName,
  getRankFromElo,
  getRapRankName,
} from "@/lib/ranking/elo-config";
import {
  getCategoryLabel,
  type SoundLibraryCategory,
} from "@/lib/sound-library/categories";
import { cn } from "@/lib/utils";

type BattleRoomPageProps = {
  params: Promise<{
    battleId: string;
  }>;
};

type StrictRule = {
  label: string;
  value: string;
};

export const dynamic = "force-dynamic";

const instantPhaseSteps = [
  BattleStatus.WAITING,
  BattleStatus.READY,
  BattleStatus.ACTIVE,
  BattleStatus.SUBMISSION,
  BattleStatus.VOTING,
  BattleStatus.FINISHED,
] as const;

const draftingPhaseSteps = [
  BattleStatus.WAITING,
  BattleStatus.READY,
  BattleStatus.DRAFTING,
  BattleStatus.ACTIVE,
  BattleStatus.SUBMISSION,
  BattleStatus.VOTING,
  BattleStatus.FINISHED,
] as const;

function StrictRulesStrip({ rules }: { rules: StrictRule[] }) {
  if (rules.length === 0) {
    return null;
  }

  return (
    <div className="border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <p className="bb-tag-label shrink-0 text-[10px] text-violet-100">
          Strict Rules
        </p>
        <div className="flex flex-wrap gap-2">
          {rules.map((rule) => (
            <span
              key={rule.label}
              className="inline-flex items-center gap-1 border border-white/10 bg-black/30 px-2.5 py-1 text-xs"
            >
              <span className="font-black uppercase tracking-[0.12em] text-zinc-500">
                {rule.label}
              </span>
              <span className="font-semibold text-white">{rule.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const soundGroupConfig = [
  {
    id: "MELODY",
    label: "Melody",
    categories: ["SYNTH", "KEY", "CHORD", "LEAD", "PAD", "PLUCK", "ARP", "LOOP"],
  },
  {
    id: "DRUMS",
    label: "Drums",
    categories: ["KICK", "SNARE", "CLAP", "HI_HAT", "OPEN_HAT"],
  },
  {
    id: "TEXTURE",
    label: "Texture",
    categories: ["PERC", "FX", "VOX"],
  },
  {
    id: "LOW_END",
    label: "Low End",
    categories: ["BASS_808", "BASS"],
  },
] as const;

function getSoundGroupId(category: string | null) {
  const categoryKey = category ?? "UNKNOWN";
  const group = soundGroupConfig.find((soundGroup) =>
    (soundGroup.categories as readonly string[]).includes(categoryKey),
  );

  return group?.id ?? "TEXTURE";
}

function buildResultRankings(
  participants: Array<{
    id: string;
    userId: string;
    score: number;
    missedSubmission: boolean;
    technicalLoss: boolean;
    forfeited: boolean;
    submission: { id: string; createdAt?: Date } | null;
    user: {
      username: string;
    };
  }>,
  votes: Array<{
    participantId: string;
    score: number;
  }>,
) {
  const scores = new Map(
    participants.map((participant) => [
      participant.id,
      votes.length > 0 ? 0 : participant.score,
    ]),
  );
  const voteCounts = new Map(participants.map((participant) => [participant.id, 0]));
  const tenCounts = new Map(participants.map((participant) => [participant.id, 0]));

  for (const vote of votes) {
    scores.set(vote.participantId, (scores.get(vote.participantId) ?? 0) + vote.score);
    voteCounts.set(vote.participantId, (voteCounts.get(vote.participantId) ?? 0) + 1);
    if (vote.score === 10) {
      tenCounts.set(vote.participantId, (tenCounts.get(vote.participantId) ?? 0) + 1);
    }
  }

  return participants
    .map((participant) => ({
      participantId: participant.id,
      userId: participant.userId,
      username: participant.user.username,
      points: scores.get(participant.id) ?? 0,
      voteCount: voteCounts.get(participant.id) ?? 0,
      averageScore:
        (voteCounts.get(participant.id) ?? 0) > 0
          ? (scores.get(participant.id) ?? 0) / (voteCounts.get(participant.id) ?? 1)
          : 0,
      tenCount: tenCounts.get(participant.id) ?? 0,
      firstSubmissionAt: participant.submission?.createdAt ?? null,
      hasSubmission: Boolean(participant.submission),
      missedSubmission: participant.missedSubmission || !participant.submission,
      technicalLoss:
        participant.technicalLoss ||
        participant.forfeited ||
        !participant.submission,
      forfeited: participant.forfeited,
    }))
    .sort((left, right) => {
      if (left.technicalLoss !== right.technicalLoss) {
        return left.technicalLoss ? 1 : -1;
      }

      if (right.points !== left.points) {
        return right.points - left.points;
      }

      if (right.averageScore !== left.averageScore) {
        return right.averageScore - left.averageScore;
      }

      if (right.tenCount !== left.tenCount) {
        return right.tenCount - left.tenCount;
      }

      if (left.firstSubmissionAt && right.firstSubmissionAt) {
        const submissionDelta =
          left.firstSubmissionAt.getTime() - right.firstSubmissionAt.getTime();

        if (submissionDelta !== 0) {
          return submissionDelta;
        }
      }

      return left.username.localeCompare(right.username);
    });
}

function getPlacementLabel(placement: number) {
  const suffix =
    placement % 10 === 1 && placement % 100 !== 11
      ? "st"
      : placement % 10 === 2 && placement % 100 !== 12
        ? "nd"
        : placement % 10 === 3 && placement % 100 !== 13
          ? "rd"
          : "th";

  return `${placement}${suffix} Place`;
}

function resultRankingsAreStillTied(
  left: ReturnType<typeof buildResultRankings>[number],
  right: ReturnType<typeof buildResultRankings>[number],
) {
  const leftSubmissionTime =
    left.firstSubmissionAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightSubmissionTime =
    right.firstSubmissionAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

  return (
    left.points === right.points &&
    left.averageScore === right.averageScore &&
    left.tenCount === right.tenCount &&
    leftSubmissionTime === rightSubmissionTime
  );
}

function AccessDeniedSection() {
  return (
    <section className="mx-auto max-w-2xl">
      <div className="bb-panel border-rose-300/20 p-6 shadow-2xl shadow-rose-950/20">
        <div className="flex items-center gap-3 text-rose-200">
          <ShieldAlertIcon className="size-5" />
          <h1 className="text-xl font-semibold text-white">Access denied</h1>
        </div>
        <p className="mt-3 text-sm text-[var(--bb-muted)]">
          You must be a participant in this battle to view the room.
        </p>
        <Button asChild className="mt-5 bg-rose-500 text-white hover:bg-rose-400">
          <Link href="/battle">Back to Battle</Link>
        </Button>
      </div>
    </section>
  );
}

export default async function BattleRoomPage({ params }: BattleRoomPageProps) {
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const loadStartedAt = Date.now();
  const { battleId } = await params;
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const authStartedAt = Date.now();
  const currentUser = await getCurrentUser();
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const authElapsedMs = Date.now() - authStartedAt;

  if (!currentUser) {
    redirect("/login");
  }

  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const battleQueryStartedAt = Date.now();
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    include: {
      participants: {
        include: {
          submission: {
            select: {
              id: true,
              fileUrl: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              eloRating: true,
              producerElo: true,
              producerWins: true,
              producerGames: true,
              rapElo: true,
              rapWins: true,
              rapGames: true,
            },
          },
        },
        orderBy: {
          joinedAt: "asc",
        },
      },
      soundPack: {
        include: {
          sounds: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
      generatedPack: {
        include: {
          sounds: {
            orderBy: {
              id: "asc",
            },
          },
        },
      },
      rapBeat: {
        select: {
          id: true,
          fileUrl: true,
          fileName: true,
          title: true,
          bpm: true,
          key: true,
          detectedBpm: true,
          bpmConfidence: true,
          detectedKey: true,
          detectedMode: true,
          keyConfidence: true,
          keyCertainty: true,
          analyzedAt: true,
          analysisStatus: true,
          producerUsername: true,
          producerAvatarUrl: true,
          producerElo: true,
          producerWins: true,
          producerGames: true,
          averageRating: true,
          ratingCount: true,
          isApprovedForRapPool: true,
        },
      },
      draft: {
        select: {
          status: true,
          finalGenre: true,
          finalBpm: true,
          finalKey: true,
          finalDurationMinutes: true,
        },
      },
      votes: {
        select: {
          voterId: true,
          participantId: true,
          score: true,
        },
      },
      eloResults: {
        select: {
          userId: true,
          oldElo: true,
          newElo: true,
          eloChange: true,
          placement: true,
          totalVotePoints: true,
        },
        orderBy: [
          {
            placement: "asc",
          },
          {
            totalVotePoints: "desc",
          },
        ],
      },
      readyChecks: {
        select: {
          userId: true,
          isReady: true,
          readyAt: true,
        },
      },
      listeningProgress: {
        where: {
          userId: currentUser.id,
        },
        select: {
          completed: true,
        },
      },
    },
  });
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const battleQueryElapsedMs = Date.now() - battleQueryStartedAt;

  if (!battle) {
    notFound();
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("battle page data load timing", {
      battleId,
      status: battle.status,
      participantCount: battle.participants.length,
      authElapsedMs,
      battleQueryElapsedMs,
      // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
      elapsedMs: Date.now() - loadStartedAt,
    });
  }

  const currentParticipant = battle.participants.find(
    (participant) => participant.userId === currentUser.id,
  );

  if (!currentParticipant) {
    return <AccessDeniedSection />;
  }

  if (currentParticipant.presenceStatus === "ABANDONED") {
    redirect("/battle");
  }

  const mode = battleModes.find((battleMode) => battleMode.id === battle.mode);
  const modeName = mode?.name ?? battle.mode;
  const isRapBattle = isRapBattleMode(battle.mode);

  if (isRapBattle && !battle.rapBeat) {
    await prepareRapBeatForBattle(battle.id);
    redirect(`/battle/${battle.id}`);
  }

  const usesDrafting = modeRequiresDrafting(battle.mode);
  const phaseSteps = usesDrafting ? draftingPhaseSteps : instantPhaseSteps;
  const participantCount = battle.participants.length;
  const battleStatus = battle.status;
  const statusDetail = battleStatusDetails[battle.status];
  const isVotingPhase = canVote(battle.status);
  const isSubmissionPhase = canSubmit(battle.status);
  const leaveAvailableStatuses = new Set<BattleStatus>([
    BattleStatus.READY,
    BattleStatus.DRAFTING,
    BattleStatus.ACTIVE,
    BattleStatus.SUBMISSION,
    BattleStatus.VOTING,
  ]);
  const isLeaveAvailable = leaveAvailableStatuses.has(battle.status);
  const currentUserAbandoned = false;
  const readyUserIds = new Set(
    battle.readyChecks
      .filter((readyCheck) => readyCheck.isReady)
      .map((readyCheck) => readyCheck.userId),
  );
  const votedUserIds = new Set(battle.votes.map((vote) => vote.voterId));
  const hasResults = battle.status === BattleStatus.FINISHED;
  const existingVoteScores = battle.votes
    .filter((vote) => vote.voterId === currentUser.id)
    .map((vote) => ({
      participantId: vote.participantId,
      score: vote.score,
    }));
  const existingVote = existingVoteScores.length > 0 ? existingVoteScores : null;
  const currentUserCompletedListening =
    Boolean(existingVote) ||
    battle.listeningProgress.some((progress) => progress.completed);
  const battlePack = !isRapBattle && battle.generatedPack
    ? {
        id: battle.generatedPack.id,
        name: "Generated Battle Pack",
        description: "Built from the Global Sound Library.",
        downloadHref: `/api/generated-battle-packs/${battle.generatedPack.id}/download`,
        sounds: battle.generatedPack.sounds.map((sound) => ({
          id: sound.id,
          name: sound.fileName,
          fileUrl: sound.fileUrl,
          fileType: sound.mimeType,
          sizeBytes: sound.sizeBytes,
          category: sound.category,
          slot: sound.slot,
        })),
      }
    : !isRapBattle && battle.soundPack
      ? {
          id: battle.soundPack.id,
          name: battle.soundPack.name,
          description: battle.soundPack.description ?? null,
          downloadHref: `/api/sound-packs/${battle.soundPack.id}/download`,
          sounds: battle.soundPack.sounds.map((sound) => ({
            id: sound.id,
            name: sound.name,
            fileUrl: sound.fileUrl,
            fileType: sound.fileType,
            sizeBytes: sound.sizeBytes,
            category: null,
            slot: null,
          })),
        }
      : null;
  const rapBeat = battle.rapBeat
    ? {
        id: battle.rapBeat.id,
        fileUrl: battle.rapBeat.fileUrl,
        bpm: battle.rapBeat.detectedBpm ?? battle.rapBeat.bpm,
        key: battle.rapBeat.detectedKey ?? battle.rapBeat.key,
        mode: battle.rapBeat.detectedMode,
        keyCertainty: battle.rapBeat.keyCertainty,
        analyzedAt: battle.rapBeat.analyzedAt,
        analysisStatus: battle.rapBeat.analysisStatus,
        producer: {
          username: battle.rapBeat.producerUsername,
          avatarUrl: battle.rapBeat.producerAvatarUrl,
          elo: battle.rapBeat.producerElo,
          wins: battle.rapBeat.producerWins,
          games: battle.rapBeat.producerGames,
        },
        averageRating: battle.rapBeat.averageRating,
        ratingCount: battle.rapBeat.ratingCount,
        isApprovedForRapPool: battle.rapBeat.isApprovedForRapPool,
      }
    : null;
  const rapBeatAwaitingAnalysis =
    Boolean(rapBeat) &&
    (rapBeat?.analysisStatus === "PENDING" ||
      (rapBeat?.analysisStatus !== "FAILED" && rapBeat?.bpm === null && !rapBeat?.key));
  const groupedBattlePackSounds = battlePack
    ? soundGroupConfig
        .map((soundGroup) => ({
          ...soundGroup,
          sounds: battlePack.sounds.filter(
            (sound) => getSoundGroupId(sound.category) === soundGroup.id,
          ),
        }))
        .filter((soundGroup) => soundGroup.sounds.length > 0)
    : [];
  const resultRankings = hasResults
    ? buildResultRankings(battle.participants, battle.votes)
    : [];
  const eloResultByUserId = new Map(
    battle.eloResults.map((result) => [result.userId, result]),
  );
  const displayResultRankings = hasResults
    ? [...resultRankings].sort((left, right) => {
        const leftElo = eloResultByUserId.get(left.userId);
        const rightElo = eloResultByUserId.get(right.userId);

        if (leftElo && rightElo && leftElo.placement !== rightElo.placement) {
          return leftElo.placement - rightElo.placement;
        }

        if (leftElo && !rightElo) {
          return -1;
        }

        if (!leftElo && rightElo) {
          return 1;
        }

        return resultRankings.indexOf(left) - resultRankings.indexOf(right);
      })
    : [];
  const validResultRankings = displayResultRankings.filter(
    (ranking) => !ranking.technicalLoss,
  );
  const noContest =
    hasResults && (validResultRankings.length === 0 || battle.votes.length === 0);
  const winner = battle.winnerId
    ? displayResultRankings.find((ranking) => ranking.userId === battle.winnerId)
    : null;
  const winnerParticipant = winner
    ? battle.participants.find(
        (participant) => participant.id === winner.participantId,
      )
    : null;
  const winnerSubmission = winnerParticipant?.submission ?? null;
  const topRanking = validResultRankings[0] ?? null;
  const isTie =
    hasResults &&
    !noContest &&
    Boolean(
      topRanking &&
        validResultRankings
          .slice(1)
          .some((ranking) => resultRankingsAreStillTied(topRanking, ranking)),
    );
  const currentStepIndex =
    battle.status === BattleStatus.CANCELLED
      ? -1
      : phaseSteps.findIndex((status) => status === battle.status);
  const draftState =
    battle.status === BattleStatus.DRAFTING
      ? await getBattleDraftState(battle.id)
      : null;
  const strictRules =
    usesDrafting &&
    battle.draft?.status === "COMPLETED" &&
    battle.draft.finalGenre &&
    battle.draft.finalBpm &&
    battle.draft.finalKey &&
    battle.draft.finalDurationMinutes
      ? [
          {
            label: "Genre",
            value: battle.draft.finalGenre,
          },
          {
            label: "BPM",
            value: battle.draft.finalBpm,
          },
          {
            label: "Key",
            value: battle.draft.finalKey,
          },
          {
            label: "Duration",
            value: `${battle.draft.finalDurationMinutes} min`,
          },
        ]
      : [];
  const shouldShowStrictRules =
    strictRules.length > 0 &&
    (
      [
        BattleStatus.ACTIVE,
        BattleStatus.SUBMISSION,
        BattleStatus.VOTING,
        BattleStatus.FINISHED,
      ] as BattleStatus[]
    ).includes(battle.status);
  const shouldShowRapBeat =
    isRapBattle && battle.status === BattleStatus.ACTIVE;
  const enableDevFakePlayers = isBattleDevToolsEnabled();
  const hasFakePlayers = battle.participants.some((participant) =>
    participant.user.username.startsWith("dev_fake_player_"),
  );
  const unreadyParticipants = battle.participants.filter(
    (participant) => !readyUserIds.has(participant.userId),
  );
  const cancelledByReadyTimeout =
    battle.status === BattleStatus.CANCELLED &&
    Boolean(battle.readyEndsAt) &&
    unreadyParticipants.length > 0;
  const cancelMessage =
    cancelledByReadyTimeout && unreadyParticipants.length === 1
      ? `Player ${unreadyParticipants[0]?.user.username} failed to connect.`
      : cancelledByReadyTimeout
        ? "Some players failed to connect."
        : "This room is closed. Return to Play when you are ready to search for a new battle.";
  const headerTitle =
    battle.status === BattleStatus.FINISHED
      ? "Results"
      : statusDetail.title.toUpperCase();
  const headerSubtitle =
    battle.status === BattleStatus.FINISHED
      ? "Final standings locked"
      : battle.title;
  function getParticipantBattleStatus(participant: {
    id: string;
    userId: string;
    beatUrl: string | null;
    forfeited: boolean;
    technicalLoss: boolean;
    missedSubmission: boolean;
    presenceStatus: string;
    submission?: unknown;
  }) {
    if (participant.presenceStatus === "ABANDONED") {
      return "Abandoned";
    }

    if (battleStatus === BattleStatus.FINISHED) {
      return "Finished";
    }

    if (participant.presenceStatus === "DISCONNECTED") {
      return "Reconnecting";
    }

    if (participant.forfeited) {
      return "Forfeited";
    }

    if (battleStatus === BattleStatus.READY) {
      return readyUserIds.has(participant.userId) ? "Ready" : "Not ready";
    }

    if (battleStatus === BattleStatus.SUBMISSION) {
      if (participant.technicalLoss) {
        return "Technical loss";
      }

      if (participant.missedSubmission) {
        return "Missed submission";
      }

      return participant.beatUrl ? "Submitted" : "No submission yet";
    }

    if (battleStatus === BattleStatus.VOTING) {
      return participant.submission || participant.beatUrl
        ? "Uploaded"
        : "Not uploaded";
    }

    return "In battle";
  }

  return (
    <section className="space-y-3" data-testid="battle-room">
      <RapBeatAnalysisRefresh enabled={rapBeatAwaitingAnalysis} />
      <BattleHeartbeat
        battleId={battle.id}
        enabled={
          !currentUserAbandoned &&
          battle.status !== BattleStatus.FINISHED &&
          battle.status !== BattleStatus.CANCELLED
        }
      />
      <BattleStatusSync
        battleId={battle.id}
        status={battle.status}
        endsAt={
          battle.status === BattleStatus.VOTING
            ? battle.votingEndsAt
            : battle.status === BattleStatus.SUBMISSION
            ? battle.submissionEndsAt
            : battle.status === BattleStatus.READY
            ? battle.readyEndsAt
            : battle.endsAt
        }
      />
      <BattleNavigationGuard
        battleId={battle.id}
        shouldConfirm={isLeaveAvailable && !currentUserAbandoned}
        mode={battle.mode}
        status={battle.status}
        producerElo={currentUser.producerElo}
        rapElo={currentUser.rapElo}
      />
      <header className="bb-raw-stage bb-ripped-edge overflow-visible">
        <div className="relative border-b border-white/10 px-3 py-4 sm:px-4 sm:py-5">
          <div className="relative grid gap-3 xl:grid-cols-[minmax(260px,0.75fr)_minmax(520px,1.15fr)_auto] xl:items-center">
            <div className="min-w-0">
              <p className="bb-tag-label text-[10px] text-violet-200">
                Battle Room
              </p>
              <h1 className="bb-kinetic-title mt-1 max-w-full text-[clamp(1.85rem,3.4vw,3.35rem)] leading-none text-white [overflow-wrap:normal] [word-break:normal]">
                {headerTitle}
              </h1>
              <p className="mt-1 truncate text-xs font-semibold text-zinc-200">
                <span data-testid="battle-title">{headerSubtitle}</span>
              </p>
            </div>

            <div
              className={cn(
                "grid gap-2 text-xs text-zinc-300",
                battle.status === BattleStatus.FINISHED
                  ? "sm:grid-cols-3"
                  : "sm:grid-cols-4",
              )}
            >
              {battle.status !== BattleStatus.FINISHED ? (
              <div className="border border-white/10 bg-black/35 p-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Status
                </p>
                <span
                  className={cn(
                    "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                    getBattleStatusBadgeClassName(battle.status),
                  )}
                >
                  {getBattleStatusLabel(battle.status)}
                </span>
              </div>
              ) : null}
              <div className="border border-white/10 bg-black/35 p-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Mode
                </p>
                <p className="mt-1 truncate font-semibold text-white">
                  {modeName}
                </p>
              </div>
              <div className="border border-white/10 bg-black/35 p-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Players
                </p>
                <p
                  className="mt-1 font-semibold text-white"
                  data-testid="participant-count"
                >
                  {participantCount}/{battle.maxPlayers} players
                </p>
              </div>
              <div className="border border-violet-300/25 bg-black/45 p-2 shadow-[0_0_34px_rgba(168,85,247,0.12)]">
                <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Timer
                </p>
                <div className="mt-1">
                  <BattleTimer
                    status={battle.status}
                    startedAt={battle.startedAt}
                    endsAt={battle.endsAt}
                    durationMinutes={battle.durationMinutes}
                    readyEndsAt={battle.readyEndsAt}
                    submissionEndsAt={battle.submissionEndsAt}
                    votingEndsAt={
                      currentUserCompletedListening ? battle.votingEndsAt : null
                    }
                    compact
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <BattleVolumeControl />
              {enableDevFakePlayers ? (
                <DevSkipPhaseButton battleId={battle.id} />
              ) : null}
              {isLeaveAvailable ? <LeaveBattleButton /> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-1 p-2 sm:grid-cols-3 lg:grid-cols-7">
          {phaseSteps.map((status, index) => {
            const isCurrent = battle.status === status;
            const isCompleted =
              currentStepIndex >= 0 && index < currentStepIndex;

            return (
              <div
                key={status}
                className={cn(
                  "relative border px-2.5 py-1.5 transition",
                  isCurrent
                    ? "border-fuchsia-300/55 bg-fuchsia-300/10 shadow-[0_0_28px_rgba(217,70,239,0.18)]"
                    : isCompleted
                      ? "border-violet-300/30 bg-violet-300/10"
                      : "border-white/10 bg-black/25",
                )}
              >
                <p className="text-xs font-semibold text-white">
                  {battleStatusDetails[status].label}
                </p>
                {isCurrent ? (
                  <span className="absolute right-3 top-3 size-2 rounded-full bg-fuchsia-300 shadow-[0_0_16px_rgba(217,70,239,0.85)]" />
                ) : null}
              </div>
            );
          })}
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="bb-flyer-card bb-slashed p-3">
            <div className="flex items-center gap-2">
              <UsersIcon className="size-5 text-violet-200" />
              <h2 className="font-bold uppercase tracking-[0.12em] text-white">
                Players
              </h2>
            </div>
            <div className="relative z-10 mt-3 space-y-1.5">
              {battle.participants.map((participant) => {
                const categoryElo = isRapBattle
                  ? participant.user.rapElo
                  : participant.user.producerElo;
                const categoryRank =
                  categoryElo !== null
                    ? getRankFromElo(categoryElo).name
                    : null;
                const displayRank =
                  categoryRank
                    ? isRapBattle
                      ? getRapRankName(categoryRank)
                      : getProducerRankName(categoryRank)
                    : null;
                return (
                  <div
                    key={participant.id}
                    data-testid="battle-participant"
                    className="border border-white/10 bg-black/35 p-2"
                  >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[0.06] text-xs font-black uppercase text-white">
                      {participant.user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={participant.user.avatarUrl}
                          alt=""
                          className="size-full object-cover object-center"
                        />
                      ) : (
                        participant.user.username.slice(0, 2)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p
                          className="truncate font-semibold text-white"
                          title={participant.user.username}
                        >
                          {participant.user.username}
                        </p>
                        {participant.userId === currentUser.id ? (
                          <span className="rounded-full bg-violet-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950">
                            You
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-fuchsia-300/25 bg-fuchsia-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.12)]">
                          <ZapIcon className="size-3 text-fuchsia-200" />
                          {categoryElo ?? "Not qualified"}
                        </span>
                        <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                          {displayRank ?? "Not qualified"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        participant.forfeited
                          ? "border-rose-300/30 bg-rose-500/10 text-rose-100"
                          : getPresenceColorClass(PresenceStatus.IN_BATTLE),
                      )}
                    >
                      {getParticipantBattleStatus(participant)}
                    </span>
                    {battleStatus === BattleStatus.VOTING ? (
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] text-violet-100",
                          votedUserIds.has(participant.userId)
                            ? "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100"
                            : "border-white/10 bg-white/[0.04] text-zinc-400",
                        )}
                      >
                        {votedUserIds.has(participant.userId)
                          ? "Voted"
                          : "Not voted"}
                      </span>
                    ) : participant.beatUrl &&
                      battleStatus !== BattleStatus.SUBMISSION ? (
                      <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 text-[10px] text-violet-100">
                        Uploaded
                      </span>
                    ) : null}
                  </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="bb-raw-stage min-h-[500px] overflow-hidden">
            <div className="p-3 sm:p-4">
              {battle.status === BattleStatus.WAITING ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <div className="inline-flex rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-violet-100">
                      Room readiness
                    </div>
                    <h3 className="mt-5 text-4xl font-black uppercase text-white">
                      Room is filling
                    </h3>
                    <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-violet-100"
                        style={{
                          width: `${Math.min(
                            100,
                            (participantCount / battle.maxPlayers) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-zinc-200">
                      {participantCount} of {battle.maxPlayers} players ready
                    </p>
                  </div>

                  <div className="border border-violet-300/15 bg-black/30 p-4">
                    <Disc3Icon className="size-8 text-violet-200" />
                    <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-white">
                      {isRapBattle ? "Rap Beat Preview" : "Sound Pack Preview"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {isRapBattle
                        ? battle.rapBeat
                          ? "Rap beat locked for this room. Analysis runs before battle."
                          : "Rap beat is being prepared for this room."
                        : battlePack
                        ? battlePack.name
                        : "Sound pack will be assigned when the battle starts."}
                    </p>
                  </div>
                </div>
              ) : null}

              {battle.status === BattleStatus.READY ? (
                <ReadyCheckPanel
                  battleId={battle.id}
                  participants={battle.participants.map((participant) => ({
                    userId: participant.userId,
                    username: participant.user.username,
                    avatarUrl: participant.user.avatarUrl,
                    isReady: readyUserIds.has(participant.userId),
                    isCurrentUser: participant.userId === currentUser.id,
                  }))}
                />
              ) : null}

              {battle.status === BattleStatus.DRAFTING && draftState ? (
                <DraftingPanel
                  battleId={battle.id}
                  currentUserId={currentUser.id}
                  initialDraft={draftState}
                />
              ) : null}

              {shouldShowStrictRules ? (
                <StrictRulesStrip rules={strictRules} />
              ) : null}

              {shouldShowRapBeat ? (
                <section className="bb-graffiti-texture relative mb-3 overflow-visible border border-fuchsia-300/20 bg-black/45 p-3 shadow-[0_0_38px_rgba(217,70,239,0.14)] transition hover:border-fuchsia-200/30">
                  <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 border-r-2 border-t-2 border-fuchsia-300/35" />
                  <div className="pointer-events-none absolute bottom-0 left-0 h-12 w-20 border-b-2 border-l-2 border-violet-300/25" />
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="bb-tag-label inline-flex -skew-x-6 border border-fuchsia-300/25 bg-fuchsia-300/10 px-2 py-1 text-xs text-fuchsia-100">
                        Rap Beat
                      </p>
                    </div>
                    {rapBeat ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 border-fuchsia-300/25 bg-black/25 px-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-300/10"
                      >
                        <a href={rapBeat.fileUrl} download>
                          <DownloadIcon className="size-3.5" />
                          Download beat
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  {rapBeat ? (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_168px] xl:grid-cols-[minmax(0,1fr)_176px]">
                      <div className="relative min-w-0 overflow-hidden border border-violet-300/15 bg-black/30 p-2 shadow-inner shadow-violet-950/30">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-200/50 to-transparent" />
                        <SubmissionAudioPlayer
                          fileUrl={rapBeat.fileUrl}
                          fileName="Rap beat"
                          showFileName={false}
                        />
                      </div>
                      <div className="grid content-start gap-2 text-sm">
                        <div className="overflow-visible border border-fuchsia-300/15 bg-fuchsia-300/10 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                            Producer
                          </p>
                          <div className="mt-1 text-base font-black uppercase tracking-[0.08em] text-fuchsia-100 drop-shadow-[0_0_10px_rgba(217,70,239,0.28)]">
                            <ProducerHoverCard producer={rapBeat.producer} />
                          </div>
                        </div>
                        <div className="border border-violet-300/15 bg-violet-300/10 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                            BPM
                          </p>
                          <p className="mt-1 text-2xl font-black uppercase leading-none tracking-[0.04em] text-white drop-shadow-[0_0_12px_rgba(196,181,253,0.28)]">
                            {rapBeat.bpm
                              ? Math.round(rapBeat.bpm)
                              : rapBeat.analysisStatus === "FAILED"
                                ? "Unknown"
                                : "Analyzing"}
                          </p>
                        </div>
                        <div className="border border-violet-300/15 bg-violet-300/10 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                            Key
                          </p>
                          <p className="mt-1 text-lg font-black uppercase leading-none tracking-[0.06em] text-violet-100 drop-shadow-[0_0_12px_rgba(168,85,247,0.28)]">
                            {rapBeat.key
                              ? `${rapBeat.keyCertainty === "POSSIBLE" ? "Possible: " : ""}${rapBeat.key}${rapBeat.mode ? ` ${rapBeat.mode}` : ""}`.toUpperCase()
                              : rapBeat.analysisStatus === "FAILED"
                                ? "Unknown"
                                : "Analyzing"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">
                      No local beats found in public/demo-audio/Global
                      Library/Beat.
                    </p>
                  )}
                </section>
              ) : null}

              {battle.status === BattleStatus.ACTIVE && !isRapBattle ? (
                <div className="space-y-3">
                  <div className="bb-graffiti-texture relative flex flex-wrap items-center justify-between gap-2 border border-violet-300/20 bg-black/45 px-3 py-2 shadow-[0_0_34px_rgba(168,85,247,0.12)]">
                    <div className="pointer-events-none absolute right-0 top-0 h-10 w-14 border-r-2 border-t-2 border-fuchsia-300/30" />
                    <div className="flex items-center gap-2">
                      <span className="bb-tag-label -skew-x-6 border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-xs text-violet-100">
                        Generated Pack
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300">
                        {battlePack?.sounds.length ?? 0} sounds
                      </span>
                    </div>
                    {battlePack ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 border-violet-300/25 bg-black/25 px-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-violet-100 hover:bg-violet-300/10"
                      >
                        <a href={battlePack.downloadHref} download>
                          <DownloadIcon className="size-3.5" />
                          Download full pack
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  {battlePack ? (
                    <div className="space-y-2">
                      {groupedBattlePackSounds.map((soundGroup) => (
                        <section
                          key={soundGroup.id}
                          className="grid gap-2 border-y border-violet-300/15 bg-black/30 p-2 sm:grid-cols-[86px_minmax(0,1fr)]"
                        >
                          <div className="flex min-h-20 items-center justify-center border-l-2 border-violet-300/40 bg-violet-300/10 px-2 py-2 text-center">
                            <span className="bb-utility-rail text-[10px] font-black uppercase text-violet-100">
                              {soundGroup.label}
                            </span>
                          </div>
                          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {soundGroup.sounds.map((sound) => (
                              <div
                                key={sound.id}
                                className="border border-white/10 bg-black/35 p-1.5 transition duration-300 hover:-translate-y-1 hover:border-fuchsia-300/35 hover:bg-fuchsia-300/10"
                              >
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  {sound.category ? (
                                    <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-violet-100">
                                      {getCategoryLabel(
                                        sound.category as SoundLibraryCategory,
                                      )}
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-violet-100">
                                      Sound
                                    </span>
                                  )}
                                  <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="size-7 shrink-0 border-white/10 bg-white/[0.04] p-0 text-zinc-100 hover:bg-white/10"
                                  >
                                    <a href={sound.fileUrl} download>
                                      <DownloadIcon className="size-3.5" />
                                    </a>
                                  </Button>
                                </div>
                                <SubmissionAudioPlayer
                                  fileUrl={sound.fileUrl}
                                  fileName={sound.name}
                                  hoverPreviewMode="restart"
                                  compact
                                  showFileName={false}
                                />
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-zinc-300">
                      Sound pack is being assigned.
                    </div>
                  )}
                </div>
              ) : null}

              {battle.status === BattleStatus.SUBMISSION ? (
                <div className="space-y-3" data-testid="submission-section">
                  <div className="flex items-center gap-3 rounded-xl border border-violet-300/20 bg-violet-300/10 p-3">
                    <FileAudioIcon className="size-6 text-violet-200" />
                    <h3 className="text-xl font-black uppercase text-white">
                      Submit your final audio
                    </h3>
                  </div>
                  <SubmissionUploadForm
                    battleId={battle.id}
                    currentSubmission={currentParticipant?.submission ?? null}
                    canSubmit={isSubmissionPhase}
                  />
                  {enableDevFakePlayers && hasFakePlayers ? (
                    <DevSeedFakeSubmissionsButton battleId={battle.id} />
                  ) : null}
                </div>
              ) : null}

              {battle.status === BattleStatus.VOTING ? (
                <div className="space-y-3" data-testid="voting-section">
                  <div className="rounded-xl border border-violet-300/20 bg-violet-400/10 p-3">
                    <VoteIcon className="size-8 text-violet-200" />
                    <h3 className="mt-2 text-xl font-black uppercase text-white">
                      {currentUserCompletedListening
                        ? "Rank the submissions"
                        : "Listening"}
                    </h3>
                  </div>
                  <VotingPanel
                    battleId={battle.id}
                    currentUserId={currentUser.id}
                    canVote={isVotingPhase}
                    listeningCompleted={currentUserCompletedListening}
                    existingVote={existingVote}
                    participants={battle.participants.map((participant) => ({
                      id: participant.id,
                      userId: participant.userId,
                      username: participant.user.username,
                      joinedAt: participant.joinedAt.toISOString(),
                      submission: participant.submission,
                    }))}
                  />
                  {enableDevFakePlayers && hasFakePlayers ? (
                    <DevFakeVotingButton battleId={battle.id} />
                  ) : null}
                </div>
              ) : null}

              {battle.status === BattleStatus.FINISHED ? (
                <div className="space-y-3" data-testid="results-section">
                  {winnerSubmission ? (
                    <div className="rounded-xl border border-fuchsia-200/35 bg-[linear-gradient(135deg,rgba(217,70,239,0.14),rgba(168,85,247,0.08))] p-3 shadow-[0_0_28px_rgba(217,70,239,0.1)]">
                      <p className="bb-tag-label mb-2 text-xs text-fuchsia-100">
                        Winning track
                      </p>
                      <SubmissionAudioPlayer
                        fileUrl={winnerSubmission.fileUrl}
                        fileName={winnerSubmission.fileName}
                        compact
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    {displayResultRankings.map((ranking, index) => {
                      const eloResult = eloResultByUserId.get(ranking.userId);
                      const placement = eloResult?.placement ?? index + 1;
                      const points =
                        eloResult?.totalVotePoints ?? ranking.points;
                      const placementLabel = noContest
                        ? "No contest"
                        : ranking.technicalLoss
                          ? "Technical loss"
                          : isTie
                            ? "Tied"
                            : getPlacementLabel(placement);
                      const placementClassName = noContest
                        ? "border-violet-300/25 bg-violet-300/10 text-violet-100"
                        : ranking.technicalLoss
                          ? "border-rose-300/25 bg-rose-500/10 text-rose-100"
                          : placement === 1
                            ? "border-fuchsia-200/40 bg-[linear-gradient(135deg,rgba(217,70,239,0.16),rgba(196,181,253,0.08))] text-fuchsia-100 shadow-[0_0_34px_rgba(217,70,239,0.12)]"
                            : placement === 2
                              ? "border-slate-200/35 bg-slate-200/10 text-slate-100 shadow-[0_0_26px_rgba(226,232,240,0.08)]"
                              : placement === 3
                                ? "border-rose-300/30 bg-rose-300/10 text-rose-100 shadow-[0_0_26px_rgba(244,114,182,0.08)]"
                                : "border-white/10 bg-black/30 text-zinc-200";
                      return (
                        <div
                          key={ranking.participantId}
                          className={cn("rounded-lg border p-3", placementClassName)}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">
                                {placementLabel}
                              </p>
                              <p className="mt-0.5 text-base font-semibold text-white">
                                {ranking.username}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <span
                                className={cn(
                                  "rounded-full border px-3 py-1 text-sm",
                                  ranking.hasSubmission
                                    ? "border-violet-300/25 bg-violet-400/10 text-violet-100"
                                    : "border-zinc-400/20 bg-zinc-500/10 text-zinc-300",
                                )}
                              >
                                {ranking.hasSubmission ? "Uploaded" : "Not uploaded"}
                              </span>
                              {ranking.technicalLoss ? (
                                <span className="rounded-full border border-rose-300/25 bg-rose-500/10 px-3 py-1 text-sm text-rose-100">
                                  Technical loss
                                </span>
                              ) : null}
                              <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-3 py-1 text-sm text-fuchsia-100">
                                Total: {points}
                              </span>
                              <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-sm font-bold text-violet-100">
                                Avg {ranking.averageScore.toFixed(1)}/10
                              </span>
                              <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-sm font-bold text-violet-100">
                                {ranking.voteCount} ratings
                              </span>
                              {eloResult ? (
                                <>
                                  <span
                                    className={cn(
                                      "rounded-full border px-3 py-1 text-sm",
                                      eloResult.eloChange >= 0
                                        ? "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100"
                                        : "border-rose-300/20 bg-rose-300/10 text-rose-100",
                                    )}
                                  >
                                    {eloResult.eloChange >= 0 ? "+" : ""}
                                    {eloResult.eloChange} Elo
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-center">
                    <ReturnToLobbyButton />
                  </div>
                </div>
              ) : null}

              {battle.status === BattleStatus.CANCELLED ? (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-6 text-center">
                  <LockIcon className="mx-auto size-10 text-rose-200" />
                  <h3 className="mt-4 text-4xl font-black uppercase text-white">
                    Room closed
                  </h3>
                  <p className="mx-auto mt-3 max-w-xl text-zinc-300">
                    {cancelMessage}
                  </p>
                  <div className="mt-6 flex justify-center">
                    <ReturnToLobbyButton />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </main>

        <div className="xl:col-span-2">
          <BattleChatPanel battleId={battle.id} />
        </div>
      </div>
    </section>
  );
}
