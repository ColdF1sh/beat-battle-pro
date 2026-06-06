"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  getProducerRankName,
  getRankFromElo,
} from "@/lib/ranking/elo-config";

type ProducerHoverCardProps = {
  producer: {
    username: string | null;
    avatarUrl: string | null;
    elo: number | null;
    wins: number | null;
    games: number | null;
  };
};

export function ProducerHoverCard({ producer }: ProducerHoverCardProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  if (!producer.username) {
    return <span className="font-semibold text-zinc-300">Unknown producer</span>;
  }

  const hasProfileSnapshot =
    producer.avatarUrl !== null ||
    producer.elo !== null ||
    producer.wins !== null ||
    producer.games !== null;
  const wins = producer.wins ?? 0;
  const games = producer.games ?? 0;
  const winrate = games > 0 ? Math.round((wins / games) * 100) : null;
  const rank =
    producer.elo !== null
      ? getProducerRankName(getRankFromElo(producer.elo).name)
      : null;

  function openCard() {
    const rect = anchorRef.current?.getBoundingClientRect();

    if (rect) {
      setPosition({
        left: Math.min(Math.max(12, rect.left), window.innerWidth - 276),
        top: Math.max(12, rect.top - 12),
      });
    }

    setIsOpen(true);
  }

  function closeCard() {
    setIsOpen(false);
  }

  if (!hasProfileSnapshot) {
    return <span className="font-semibold text-white">{producer.username}</span>;
  }

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        onMouseEnter={openCard}
        onFocus={openCard}
        onMouseLeave={closeCard}
        onBlur={closeCard}
        className="font-semibold text-fuchsia-100 underline decoration-fuchsia-300/30 underline-offset-4 transition hover:text-white"
      >
        {producer.username}
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              onMouseEnter={openCard}
              onMouseLeave={closeCard}
              className="fixed z-[9999] w-64 -translate-y-full border border-fuchsia-300/25 bg-zinc-950/95 p-3 text-left shadow-2xl shadow-fuchsia-950/35 backdrop-blur"
              style={{
                left: position.left,
                top: position.top,
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-fuchsia-300/10 text-sm font-black uppercase text-white">
                  {producer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={producer.avatarUrl}
                      alt=""
                      className="size-full object-cover object-center"
                    />
                  ) : (
                    producer.username.slice(0, 2)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-white">
                    {producer.username}
                  </span>
                  <span className="block truncate text-xs text-zinc-400">
                    {rank ?? "Not qualified"}
                  </span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <span className="border border-white/10 bg-white/[0.04] p-2">
                  <span className="block font-black text-white">
                    {producer.elo !== null ? `${producer.elo}` : "Not qualified"}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Elo
                  </span>
                </span>
                <span className="border border-white/10 bg-white/[0.04] p-2">
                  <span className="block font-black text-white">{wins}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Wins
                  </span>
                </span>
                <span className="border border-white/10 bg-white/[0.04] p-2">
                  <span className="block font-black text-white">{games}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Games
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                <span>Winrate</span>
                <span className="font-bold text-fuchsia-100">
                  {winrate !== null ? `${winrate}%` : "--"}
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
