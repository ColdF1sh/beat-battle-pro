"use client";

import {
  Mic2Icon,
  RadioTowerIcon,
  ShoppingBagIcon,
  SwordsIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ActiveMatchGate } from "@/components/battle/active-match-gate";
import { UserMenu } from "@/components/auth/user-menu";
import { SettingsMenu } from "@/components/settings/settings-menu";
import {
  getProducerRankName,
  getRankFromElo,
  getRapRankName,
} from "@/lib/ranking/elo-config";
import { cn } from "@/lib/utils";

type GameClientUser = {
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  eloRating: number;
  producerElo: number | null;
  rapElo: number | null;
};

type GameClientShellProps = {
  children: ReactNode;
  user: GameClientUser | null;
};

const mainNavItems = [
  {
    href: "/shop",
    label: "Shop",
    eyebrow: "Loadout",
    icon: ShoppingBagIcon,
    match: ["/shop"],
    side: "left",
  },
  {
    href: "/battle",
    label: "Play",
    eyebrow: "Matchmaking",
    icon: SwordsIcon,
    match: ["/battle"],
    side: "center",
  },
  {
    href: "/community",
    label: "Community",
    eyebrow: "Social",
    icon: UsersIcon,
    match: ["/community"],
    side: "right",
  },
] as const;

function isActive(pathname: string, matches: readonly string[]) {
  return matches.some(
    (match) => pathname === match || pathname.startsWith(`${match}/`),
  );
}

export function GameClientShell({
  children,
  user,
}: GameClientShellProps) {
  const pathname = usePathname();
  const leaderboardActive = isActive(pathname, ["/leaderboard"]);
  const isBattleRoom = /^\/battle\/[^/]+/.test(pathname);
  const producerRank =
    user?.producerElo !== null && user?.producerElo !== undefined
      ? getProducerRankName(getRankFromElo(user.producerElo).name)
      : null;
  const rapRank =
    user?.rapElo !== null && user?.rapElo !== undefined
      ? getRapRankName(getRankFromElo(user.rapElo).name)
      : null;
  const rankChips = [
    user?.producerElo !== null && user?.producerElo !== undefined
      ? {
          id: "producer",
          icon: ZapIcon,
          elo: user.producerElo,
          rank: producerRank,
          className: "border-violet-300/20 bg-violet-300/10 text-violet-100",
        }
      : null,
    user?.rapElo !== null && user?.rapElo !== undefined
      ? {
          id: "rap",
          icon: Mic2Icon,
          elo: user.rapElo,
          rank: rapRank,
          className: "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100",
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    icon: typeof ZapIcon;
    elo: number;
    rank: string | null;
    className: string;
  }>;
  const compactEloLabel =
    rankChips.length > 0
      ? rankChips.map((chip) => `${chip.elo} ${chip.rank}`).join(" / ")
      : "--";

  return (
    <div className="bb-client-bg bb-grid-overlay bb-graffiti-texture bb-concrete min-h-screen overflow-hidden text-foreground">
      <ActiveMatchGate enabled={Boolean(user) && !isBattleRoom} />
      <header className="bb-top-nav sticky top-0 z-50">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          {isBattleRoom ? (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("beat-battle-request-leave", {
                  detail: {
                    href: "/",
                  },
                }),
              )
            }
            className="group flex min-w-0 items-center gap-3"
            aria-label="Leave battle or go home"
          >
            <span className="bb-chrome-border flex size-10 shrink-0 -skew-x-6 items-center justify-center bg-[var(--bb-danger)] text-sm font-black text-[var(--bb-paper)]">
              BB
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="bb-tag-label block text-sm text-white">
                Beat Battle Pro
              </span>
            </span>
          </button>
          ) : (
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-3"
            aria-label="Beat Battle Pro home"
          >
            <span className="bb-chrome-border flex size-10 shrink-0 -skew-x-6 items-center justify-center bg-[var(--bb-danger)] text-sm font-black text-[var(--bb-paper)]">
              BB
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="bb-tag-label block text-sm text-white">
                Beat Battle Pro
              </span>
            </span>
          </Link>
          )}

          {isBattleRoom ? (
            <div className="ml-auto hidden items-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold uppercase tracking-[0.14em] text-zinc-300 md:flex">
              Battle Room
            </div>
          ) : (
            <nav className="ml-auto hidden items-center gap-2 md:flex">
              <Link
                href="/leaderboard"
                className={cn(
                  "inline-flex h-10 items-center gap-2 border px-3 text-sm font-black uppercase tracking-[0.12em] transition-[transform,background] duration-150",
                  leaderboardActive
                    ? "border-[var(--bb-toxic)] bg-[var(--bb-toxic)] text-zinc-950"
                    : "border-white/10 bg-black/35 text-zinc-300 hover:-translate-y-1 hover:bg-white/[0.08] hover:text-white",
                )}
              >
                <TrophyIcon className="size-4" />
                Leaderboard
              </Link>
            </nav>
          )}

          <div className={cn("hidden md:block", isBattleRoom && "md:hidden")}>
            <SettingsMenu />
          </div>

          {user && !isBattleRoom ? (
            <div className="hidden items-center gap-3 lg:flex">
              <div className="flex max-w-[34rem] items-center gap-1.5 border-l-2 border-violet-300/30 bg-black/35 px-2 py-1.5">
                {rankChips.length > 0 ? (
                  rankChips.map((chip) => {
                    const Icon = chip.icon;

                    return (
                      <div
                        key={chip.id}
                        className={cn(
                          "flex h-8 min-w-0 items-center gap-1.5 border px-2 shadow-[0_0_18px_rgba(168,85,247,0.08)]",
                          chip.className,
                        )}
                        title={`${chip.elo} ${chip.rank}`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="font-black leading-none text-white">
                          {chip.elo}
                        </span>
                        <span className="max-w-36 truncate text-[10px] font-black uppercase leading-none tracking-[0.08em]">
                          {chip.rank}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex h-8 items-center gap-1.5 border border-violet-300/20 bg-violet-300/10 px-2 text-violet-100">
                    <ZapIcon className="size-3.5" />
                    <span className="font-black">--</span>
                  </div>
                )}
              </div>
              <UserMenu user={user} />
            </div>
          ) : !isBattleRoom ? (
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/login"
                className="px-3 py-2 text-sm font-bold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="bg-[var(--bb-danger)] px-3 py-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--bb-paper)] transition hover:bg-[var(--bb-rust)]"
              >
                Register
              </Link>
            </div>
          ) : null}

          <div className={cn("flex items-center gap-2 lg:hidden", isBattleRoom && "hidden")}>
            <SettingsMenu />
            {user ? (
              <UserMenu user={user} triggerTestId="mobile-user-menu-trigger" />
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-24 pt-4 sm:px-6 lg:pb-8">
        {!isBattleRoom ? (
          <section className="mb-5">
          <div className="grid gap-2.5 md:grid-cols-[minmax(0,0.78fr)_minmax(0,1.18fr)_minmax(0,0.78fr)] md:items-stretch">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.match);
              const isPlay = item.side === "center";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                  "bb-wall-nav-card group relative overflow-hidden transition",
                  isPlay
                    ? "min-h-28 md:min-h-36"
                    : "min-h-[5rem] md:min-h-28",
                    active ? "text-white" : "text-zinc-300 hover:text-white",
                  )}
                  data-label={item.label}
                  data-active={active ? "true" : "false"}
                >
                  <div className="absolute left-4 top-3 h-10 w-1.5 bg-[var(--bb-toxic)] opacity-70" />
                  <div className="absolute right-3 top-3 z-20 rotate-3 border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">
                    {item.eyebrow}
                  </div>
                  <div className="relative z-10 flex min-h-[inherit] items-center justify-start p-5 pl-9 text-left md:p-6 md:pl-12">
                    <div className="max-w-[82%]">
                      <h2
                        className={cn(
                          "bb-kinetic-title max-w-full whitespace-nowrap",
                          isPlay
                            ? "text-6xl sm:text-7xl"
                            : "text-4xl sm:text-5xl",
                        )}
                      >
                        {item.label}
                      </h2>
                    </div>
                    <Icon
                      className={cn(
                        "pointer-events-none absolute bottom-3 right-4 z-0 shrink-0 text-[var(--bb-paper)]/18 transition-[transform,color] duration-150 group-hover:-rotate-6 group-hover:text-[var(--bb-toxic)]/35",
                        isPlay ? "size-16 sm:size-20" : "size-10 sm:size-14",
                      )}
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-2.5 grid gap-2.5 md:hidden">
            <div className="grid gap-2.5">
              <Link
                href="/leaderboard"
                className={cn(
                  "flex h-12 items-center justify-center gap-2 border border-white/10 bg-black/40 text-sm font-black uppercase tracking-[0.14em]",
                  leaderboardActive ? "bg-[var(--bb-toxic)] text-zinc-950" : "text-zinc-300",
                )}
              >
                <TrophyIcon className="size-4" />
                Leaderboard
              </Link>
            </div>
            {user ? (
              <div className="flex items-center justify-between border border-white/10 bg-black/40 px-3 py-2 text-sm">
                <span className="truncate text-zinc-300">{user.username}</span>
                <span className="inline-flex items-center gap-1 text-[var(--bb-toxic)]">
                  <ZapIcon className="size-3.5" />
                  <span className="max-w-48 truncate">{compactEloLabel}</span>
                </span>
              </div>
            ) : null}
          </div>
          </section>
        ) : null}

        <main
          className={cn(
            "bb-graffiti-texture rounded-xl",
            isBattleRoom
              ? "min-h-[calc(100vh-6rem)]"
              : "min-h-[calc(100vh-15.5rem)]",
          )}
        >
          {children}
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/60 to-transparent" />
      {!isBattleRoom ? (
        <div className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 border border-white/10 bg-black/80 p-1 shadow-2xl backdrop-blur md:hidden">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.match);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex size-11 items-center justify-center transition",
                active
                  ? "bg-[var(--bb-danger)] text-[var(--bb-paper)]"
                  : "text-zinc-400 hover:bg-white/10 hover:text-white",
              )}
              aria-label={item.label}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
        <Link
          href="/leaderboard"
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition",
            leaderboardActive
              ? "bg-[var(--bb-toxic)] text-zinc-950"
              : "text-zinc-400 hover:bg-white/10 hover:text-white",
          )}
          aria-label="Leaderboard"
        >
          <RadioTowerIcon className="size-5" />
        </Link>
        </div>
      ) : null}
    </div>
  );
}
