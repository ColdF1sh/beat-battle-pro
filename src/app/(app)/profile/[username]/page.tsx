import { BattleStatus } from "@prisma/client";
import { BarChart3Icon, CalendarIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { AvatarUploadForm } from "@/components/profile/avatar-upload-form";
import { EloTrajectoryPanel } from "@/components/profile/elo-trajectory-panel";
import { RecentMatchHistory } from "@/components/profile/recent-match-history";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { getCurrentUser } from "@/lib/auth";
import { battleModes } from "@/lib/battle/modes";
import { prisma } from "@/lib/prisma";
import {
  getProducerRankName,
  getRankFromElo,
  getRapRankName,
} from "@/lib/ranking/elo-config";
import { cn } from "@/lib/utils";

type PublicProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getInitials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="bb-flyer-card bb-slashed p-4">
      <p className="relative z-10 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "relative z-10 mt-2 text-3xl font-black uppercase text-white",
          accent ? "text-violet-200" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const loadStartedAt = Date.now();
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const authStartedAt = Date.now();
  const currentUser = await getCurrentUser();
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const authElapsedMs = Date.now() - authStartedAt;

  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const queryStartedAt = Date.now();
  const user = await prisma.user.findUnique({
    where: {
      username: decodedUsername,
    },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      eloRating: true,
      producerElo: true,
      rapElo: true,
      createdAt: true,
      _count: {
        select: {
          participations: {
            where: {
              battle: {
                status: BattleStatus.FINISHED,
              },
            },
          },
        },
      },
      eloResults: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        select: {
          battleId: true,
          oldElo: true,
          newElo: true,
          eloChange: true,
          placement: true,
          totalVotePoints: true,
          createdAt: true,
          battle: {
            select: {
              mode: true,
            },
          },
        },
      },
    },
  });
  // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
  const queryElapsedMs = Date.now() - queryStartedAt;

  if (!user) {
    notFound();
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("profile page data load timing", {
      username: decodedUsername,
      authElapsedMs,
      queryElapsedMs,
      // eslint-disable-next-line react-hooks/purity -- dev-only server timing probe.
      elapsedMs: Date.now() - loadStartedAt,
    });
  }

  const producerRank = user.producerElo !== null
    ? getRankFromElo(user.producerElo)
    : null;
  const rapRank = user.rapElo !== null ? getRankFromElo(user.rapElo) : null;
  const rankedResults = user.eloResults;
  const battlesPlayed = Math.max(rankedResults.length, user._count.participations);
  const totalWins = rankedResults.filter((result) => result.placement <= 2).length;
  const winrate =
    battlesPlayed > 0 ? Math.round((totalWins / battlesPlayed) * 1000) / 10 : 0;
  const recentMatches = rankedResults.map((result) => ({
    id: `${result.battleId}-${result.createdAt.toISOString()}`,
    modeName:
      battleModes.find((mode) => mode.id === result.battle.mode)?.name ??
      result.battle.mode,
    category:
      battleModes.find((mode) => mode.id === result.battle.mode)?.category ===
      "rap"
        ? ("Rap" as const)
        : ("Producer" as const),
    placement: result.placement,
    eloChange: result.eloChange,
    points: result.totalVotePoints,
    createdAt: result.createdAt.toISOString(),
  }));
  const producerResults = [...user.eloResults]
    .reverse()
    .filter((result) => {
      const mode = battleModes.find(
        (battleMode) => battleMode.id === result.battle.mode,
      );

      return mode?.category !== "rap";
    });
  const rapResults = [...user.eloResults]
    .reverse()
    .filter((result) => {
      const mode = battleModes.find(
        (battleMode) => battleMode.id === result.battle.mode,
      );

      return mode?.category === "rap";
    });
  const producerEloHistoryChartData = producerResults
    .map((result, index) => ({
      label: `B${index + 1}`,
      elo: result.newElo,
    }));
  const rapEloHistoryChartData = rapResults.map((result, index) => ({
    label: `B${index + 1}`,
    elo: result.newElo,
  }));

  return (
    <section className="space-y-5" data-testid="public-profile-page">
      <div className="bb-raw-stage bb-ripped-edge relative min-h-[22rem] overflow-visible p-5 pt-8 sm:p-7 sm:pt-9">
        <div className="relative z-10 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_21rem] xl:items-center">
          <div className="relative w-fit lg:-translate-y-3">
            <Avatar className="size-36 border-2 border-violet-300/35 bg-zinc-900 shadow-[0_0_60px_rgba(168,85,247,0.16)] sm:size-40">
              {user.avatarUrl ? (
                <AvatarImage
                  src={user.avatarUrl}
                  alt={`${user.username} avatar`}
                  className="object-cover object-center"
                />
              ) : null}
              <AvatarFallback className="bg-zinc-900 text-xl font-black text-violet-200 sm:text-2xl">
                {getInitials(user.username)}
              </AvatarFallback>
            </Avatar>
            <AvatarUploadForm
              isCurrentUser={currentUser?.id === user.id}
              username={user.username}
            />
          </div>

          <div className="min-w-0 overflow-visible">
            <h1
              className="bb-kinetic-title max-w-full overflow-hidden text-ellipsis break-words text-[clamp(2.25rem,8vw,7rem)] leading-none text-white"
              title={user.username}
            >
              {user.username}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-sm font-bold uppercase text-violet-100">
                {producerRank
                  ? getProducerRankName(producerRank.name)
                  : "Not qualified"}
              </span>
              <span className="border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-bold uppercase text-zinc-300">
                {rapRank ? getRapRankName(rapRank.name) : "Not qualified"}
              </span>
              <span className="inline-flex items-center gap-1 border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-zinc-300">
                <CalendarIcon className="size-4" />
                Joined {formatDate(user.createdAt)}
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:col-span-2 xl:col-span-1 xl:grid-cols-1">
            <div className="border-l-2 border-violet-300/35 bg-black/35 px-4 py-3">
              <p className="text-4xl font-black text-violet-200">
                {user.producerElo ?? "Not qualified"}
              </p>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Producer Elo
              </p>
            </div>
            <div className="border-l-2 border-violet-300/35 bg-black/35 px-4 py-3">
              <p className="text-4xl font-black text-violet-200">
                {user.rapElo ?? "Not qualified"}
              </p>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Rap Elo
              </p>
            </div>
            <div className="border-l-2 border-white/20 bg-black/35 px-4 py-3">
              <p className="text-4xl font-black text-white">
                {winrate.toFixed(1)}%
              </p>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Winrate
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Producer Elo"
          value={user.producerElo ?? "Not qualified"}
          accent
        />
        <StatCard
          label="Rap Elo"
          value={user.rapElo ?? "Not qualified"}
          accent
        />
        <StatCard label="Wins" value={totalWins} />
        <StatCard label="Games" value={battlesPlayed} />
        <StatCard label="Winrate" value={`${winrate.toFixed(1)}%`} />
      </div>

      <div className="space-y-4">
        <div className="bb-raw-stage bb-slashed min-h-[22rem] p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3Icon className="size-5 text-violet-200" />
            <div>
              <h2 className="font-black uppercase tracking-[0.14em] text-white">
                Elo trajectory
              </h2>
              <p className="bb-text-muted text-sm">
                Recent rating movement over ranked battles.
              </p>
            </div>
          </div>
          <EloTrajectoryPanel
            producerData={producerEloHistoryChartData}
            rapData={rapEloHistoryChartData}
          />
        </div>

        <RecentMatchHistory matches={recentMatches} />
      </div>
    </section>
  );
}
