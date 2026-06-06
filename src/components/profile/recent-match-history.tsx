"use client";

import { useState } from "react";

import { gameButtonClassName } from "@/components/ui/game-button";
import { cn } from "@/lib/utils";

type RecentMatch = {
  id: string;
  modeName: string;
  category: "Producer" | "Rap";
  placement: number;
  eloChange: number;
  points: number;
  createdAt: string;
};

type RecentMatchHistoryProps = {
  matches: RecentMatch[];
};

function getPlacementLabel(placement: number) {
  if (placement === 1) {
    return "1st";
  }

  if (placement === 2) {
    return "2nd";
  }

  if (placement === 3) {
    return "3rd";
  }

  return `${placement}th`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function RecentMatchHistory({ matches }: RecentMatchHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleMatches = isExpanded ? matches.slice(0, 20) : matches.slice(0, 5);

  return (
    <div className="bb-poster-stack">
      <div className="bb-flyer-card bb-ripped-edge p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black uppercase tracking-[0.14em]">
              Recent Matches
            </h2>
          </div>
          {matches.length > 5 ? (
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className={gameButtonClassName("secondary", "h-9 px-3 text-[10px]")}
            >
              {isExpanded ? "Show less" : "See more"}
            </button>
          ) : null}
        </div>

        {visibleMatches.length > 0 ? (
          <div className="mt-4 hidden w-full border-y border-white/10 bg-black/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500 md:grid md:grid-cols-[1.1fr_0.8fr_0.65fr_0.75fr_0.65fr_minmax(14rem,2.2fr)_0.9fr] md:gap-4">
            <span>Date</span>
            <span>Result</span>
            <span>Place</span>
            <span>Elo</span>
            <span>Points</span>
            <span>Mode</span>
            <span>Category</span>
          </div>
        ) : null}

        {visibleMatches.length > 0 ? (
          <div className="bb-scrollbar max-h-[24rem] w-full overflow-y-auto pr-1">
            {visibleMatches.map((match) => {
              const isWin = match.placement <= 2;

              return (
                <div
                  key={match.id}
                  className="relative w-full border-b border-white/10 bg-black/25 px-3 py-3 transition hover:bg-violet-400/10 md:grid md:grid-cols-[1.1fr_0.8fr_0.65fr_0.75fr_0.65fr_minmax(14rem,2.2fr)_0.9fr] md:items-center md:gap-4"
                >
                  <span
                    className={cn(
                      "absolute bottom-2 left-0 top-2 w-1",
                      isWin ? "bg-fuchsia-400" : "bg-zinc-700",
                    )}
                  />
                  <p className="pl-3 text-xs font-semibold text-zinc-400 md:pl-0">
                    {formatDate(match.createdAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 md:mt-0">
                    <span
                      className={cn(
                        "border px-2.5 py-1 text-xs font-black uppercase",
                        isWin
                          ? "border-violet-300/30 bg-violet-400/10 text-violet-100"
                          : "border-zinc-300/20 bg-white/[0.04] text-zinc-300",
                      )}
                    >
                      {isWin ? "Win" : "Loss"}
                    </span>
                  </div>
                  <span className="mt-2 inline-flex border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300 md:mt-0 md:w-fit">
                    {getPlacementLabel(match.placement)}
                  </span>
                  <span
                    className={cn(
                      "mt-2 inline-flex border px-2.5 py-1 text-xs font-semibold md:mt-0 md:w-fit",
                      match.eloChange >= 0
                        ? "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100"
                        : "border-rose-300/20 bg-rose-300/10 text-rose-100",
                    )}
                  >
                    {match.eloChange >= 0 ? "+" : ""}
                    {match.eloChange}
                  </span>
                  <span className="mt-2 inline-flex border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-zinc-300 md:mt-0 md:w-fit">
                    {match.points}
                  </span>
                  <p className="mt-2 min-w-0 truncate text-sm font-semibold text-white md:mt-0">
                    {match.modeName}
                  </p>
                  <span className="mt-2 inline-flex w-fit border border-violet-300/25 bg-violet-400/10 px-2.5 py-1 text-xs font-black uppercase text-violet-100 md:mt-0">
                    {match.category}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 border border-white/10 bg-black/25 p-6 text-center">
            <p className="font-medium text-white">No match history yet</p>
            <p className="mt-2 text-sm text-zinc-400">
              Completed ranked battles will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
