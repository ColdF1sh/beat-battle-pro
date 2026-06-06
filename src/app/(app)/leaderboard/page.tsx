"use client";

import {
  AlertCircleIcon,
  HeadphonesIcon,
  Loader2Icon,
  MicIcon,
  TrophyIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type LeaderboardCategory = "beatmaking" | "rap";

type LeaderboardPlayer = {
  rank: number;
  username: string;
  avatarUrl: string | null;
  eloRating: number;
  rankTitle: string;
  wins: number;
  battlesPlayed: number;
  winrate: number;
};

type LeaderboardResponse = {
  category: "overall" | LeaderboardCategory;
  players: LeaderboardPlayer[];
};

type LeaderboardState = {
  isLoading: boolean;
  error: string | null;
  players: LeaderboardPlayer[];
  responseCategory: LeaderboardResponse["category"] | null;
};

const categoryLabels: Record<LeaderboardCategory, string> = {
  beatmaking: "Producers",
  rap: "Rappers",
};

function getInitials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function getTopRankClassName(rank: number) {
  if (rank === 1) {
    return "border-fuchsia-300/45 bg-fuchsia-300/12 shadow-[0_0_36px_rgba(217,70,239,0.16)]";
  }

  if (rank === 2) {
    return "border-violet-200/35 bg-violet-200/10 shadow-[0_0_30px_rgba(196,181,253,0.12)]";
  }

  if (rank === 3) {
    return "border-violet-300/35 bg-violet-300/10 shadow-[0_0_30px_rgba(167,139,250,0.12)]";
  }

  return "border-white/10 bg-black/25";
}

function LeaderboardContent({
  state,
  category,
}: {
  state: LeaderboardState;
  category: LeaderboardCategory;
}) {
  if (state.isLoading) {
    return (
      <div className="bb-panel-soft flex min-h-64 items-center justify-center rounded-xl text-zinc-300">
        <Loader2Icon className="mr-2 size-5 animate-spin text-cyan-300" />
        Loading leaderboard...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircleIcon className="size-5" />
          Leaderboard unavailable
        </div>
        <p className="mt-2 text-sm text-rose-100/80">{state.error}</p>
      </div>
    );
  }

  if (state.players.length === 0) {
    return (
      <div className="bb-panel-soft rounded-xl p-6 text-center">
        <TrophyIcon className="mx-auto size-8 text-zinc-500" />
        <h2 className="mt-3 font-medium text-white">No ranked players yet</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Finish ranked battles to appear on the {categoryLabels[category]} leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-black/30 lg:block">
        <div className="grid grid-cols-[72px_minmax(220px,1fr)_180px_90px_80px_90px_110px] gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
          <span>Rank</span>
          <span>Player</span>
          <span>Title</span>
          <span>Elo</span>
          <span>Wins</span>
          <span>Winrate</span>
          <span>Games</span>
        </div>
        <div className="divide-y divide-white/10">
          {state.players.map((player) => (
            <LeaderboardRow key={player.username} player={player} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:hidden">
        {state.players.map((player) => (
          <LeaderboardMobileCard key={player.username} player={player} />
        ))}
      </div>
    </div>
  );
}

function LeaderboardRow({ player }: { player: LeaderboardPlayer }) {
  return (
    <Link
      href={`/profile/${encodeURIComponent(player.username)}`}
      className={cn(
        "grid grid-cols-[72px_minmax(220px,1fr)_180px_90px_80px_90px_110px] items-center gap-3 px-4 py-4 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
        player.rank <= 3 ? getTopRankClassName(player.rank) : "",
      )}
    >
      <RankBadge rank={player.rank} />
      <PlayerIdentity player={player} />
      <span className="text-zinc-300">{player.rankTitle}</span>
      <span className="font-black text-cyan-200">{player.eloRating}</span>
      <span className="text-zinc-300">{player.wins}</span>
      <span className="text-zinc-300">{player.winrate.toFixed(1)}%</span>
      <span className="text-zinc-300">{player.battlesPlayed}</span>
    </Link>
  );
}

function LeaderboardMobileCard({ player }: { player: LeaderboardPlayer }) {
  return (
    <Link
      href={`/profile/${encodeURIComponent(player.username)}`}
      className={cn(
        "block rounded-xl border p-4 shadow-2xl transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
        getTopRankClassName(player.rank),
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <PlayerIdentity player={player} />
        <RankBadge rank={player.rank} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Title" value={player.rankTitle} />
        <Metric label="Elo" value={player.eloRating} strong />
        <Metric label="Wins" value={player.wins} />
        <Metric label="Winrate" value={`${player.winrate.toFixed(1)}%`} />
        <Metric label="Games" value={player.battlesPlayed} />
      </div>
    </Link>
  );
}

function PlayerIdentity({ player }: { player: LeaderboardPlayer }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md">
      <Avatar className="border border-white/10 bg-zinc-900">
        {player.avatarUrl ? (
          <AvatarImage
            src={player.avatarUrl}
            alt={`${player.username} avatar`}
            className="object-cover object-center"
          />
        ) : null}
        <AvatarFallback className="bg-zinc-900 text-xs font-semibold text-violet-200">
          {getInitials(player.username)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-semibold text-white" title={player.username}>
          {player.username}
        </p>
        <p className="truncate text-xs text-zinc-500">Ranked competitor</p>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-12 items-center justify-center rounded-full border text-sm font-black",
        rank === 1
        ? "border-fuchsia-300/40 bg-fuchsia-300/15 text-fuchsia-100"
          : rank === 2
            ? "border-cyan-200/30 bg-cyan-200/15 text-cyan-100"
            : rank === 3
              ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
              : "border-white/10 bg-white/[0.04] text-zinc-300",
      )}
    >
      #{rank}
    </span>
  );
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm text-zinc-200",
          strong ? "font-black text-cyan-200" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function LeaderboardPage() {
  const [activeCategory, setActiveCategory] =
    useState<LeaderboardCategory>("beatmaking");
  const [leaderboards, setLeaderboards] = useState<
    Record<LeaderboardCategory, LeaderboardState>
  >({
    beatmaking: {
      isLoading: true,
      error: null,
      players: [],
      responseCategory: null,
    },
    rap: {
      isLoading: true,
      error: null,
      players: [],
      responseCategory: null,
    },
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeaderboard(category: LeaderboardCategory) {
      setLeaderboards((current) => ({
        ...current,
        [category]: {
          ...current[category],
          isLoading: true,
          error: null,
        },
      }));

      try {
        const response = await fetch(
          `/api/leaderboard?category=${category}&limit=100`,
          {
            signal: controller.signal,
          },
        );
        const data = (await response.json()) as
          | LeaderboardResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in data && data.error
              ? data.error
              : "Could not load the leaderboard.",
          );
        }

        if (!("players" in data)) {
          throw new Error("Leaderboard response was not valid.");
        }

        setLeaderboards((current) => ({
          ...current,
          [category]: {
            isLoading: false,
            error: null,
            players: data.players,
            responseCategory: data.category,
          },
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLeaderboards((current) => ({
          ...current,
          [category]: {
            ...current[category],
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not load the leaderboard.",
          },
        }));
      }
    }

    void loadLeaderboard("beatmaking");
    void loadLeaderboard("rap");

    return () => controller.abort();
  }, []);

  return (
    <section className="space-y-6" data-testid="leaderboard-page">
      <div className="bb-panel relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(139,92,246,0.28),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(34,211,238,0.18),transparent_34%)]" />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="bb-tag-label text-xs text-cyan-200">
              Ranked Ladder
            </p>
            <h1 className="bb-street-title mt-2 text-5xl text-white sm:text-7xl">
              Leaderboard
            </h1>
          </div>
          <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
            Top 100
          </span>
        </div>
      </div>

      <div className="bb-panel bb-graffiti-texture rounded-2xl p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <TrophyIcon className="size-5 text-cyan-200" />
              <h2 className="text-lg font-black uppercase tracking-[0.14em] text-white">
                Rankings
              </h2>
            </div>
          </div>
        </div>
          <Tabs
            value={activeCategory}
            onValueChange={(value) =>
              setActiveCategory(value as LeaderboardCategory)
            }
            className="gap-5"
          >
            <TabsList className="bb-panel-soft h-12 rounded-xl p-1 text-zinc-400">
              <TabsTrigger
                value="beatmaking"
                data-testid="leaderboard-tab-beatmaking"
                className="h-10 data-active:bg-cyan-300 data-active:text-zinc-950"
              >
                <HeadphonesIcon className="size-4" />
                Producers
              </TabsTrigger>
              <TabsTrigger
                value="rap"
                data-testid="leaderboard-tab-rap"
                className="h-10 data-active:bg-violet-400 data-active:text-white"
              >
                <MicIcon className="size-4" />
                Rappers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="beatmaking">
              <LeaderboardContent
                category="beatmaking"
                state={leaderboards.beatmaking}
              />
            </TabsContent>
            <TabsContent value="rap">
              <LeaderboardContent category="rap" state={leaderboards.rap} />
            </TabsContent>
          </Tabs>
      </div>
    </section>
  );
}
