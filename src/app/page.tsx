import {
  ActivityIcon,
  Disc3Icon,
  NewspaperIcon,
  RadioTowerIcon,
  ShoppingBagIcon,
  SwordsIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { GameClientShell } from "@/components/layout/game-client-shell";
import { gameButtonClassName } from "@/components/ui/game-button";
import { getCurrentUser } from "@/lib/auth";
import {
  getPresenceColorClass,
  getPresenceLabel,
  PresenceStatus,
} from "@/lib/presence/status";
import {
  getProducerRankName,
  getRankFromElo,
} from "@/lib/ranking/elo-config";
import { cn } from "@/lib/utils";

const mockStats = [
  {
    label: "Online",
    value: "--",
    detail: "Signal",
    icon: RadioTowerIcon,
    status: PresenceStatus.ONLINE,
  },
  {
    label: "Battles",
    value: "--",
    detail: "Rooms",
    icon: SwordsIcon,
    status: PresenceStatus.IN_BATTLE,
  },
  {
    label: "Searching",
    value: "--",
    detail: "Queue",
    icon: ActivityIcon,
    status: PresenceStatus.SEARCHING,
  },
];

function PublicHome() {
  return (
    <main className="bb-client-bg bb-grid-overlay bb-graffiti-texture bb-concrete min-h-screen px-5 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.6fr)]">
        <div className="relative max-w-3xl space-y-6">
          <span className="bb-graffiti-accent pointer-events-none absolute -right-4 top-0 hidden text-5xl opacity-25 sm:block">
            Raw
          </span>
          <p className="bb-tag-label text-sm text-violet-100">Beat Battle Pro</p>
          <h1 className="bb-street-title max-w-3xl text-6xl sm:text-8xl lg:text-9xl">
            Underground beat battles.
          </h1>
          <p className="max-w-xl border-l-2 border-fuchsia-300/35 pl-4 text-sm font-medium uppercase tracking-[0.16em] text-zinc-300">
            Producer rooms. Ranked placements. One kit. One clock.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link className={gameButtonClassName("danger", "h-12 px-6")} href="/register">
              Create account
            </Link>
            <Link className={gameButtonClassName("secondary", "h-12 px-6")} href="/login">
              Log in
            </Link>
          </div>
        </div>

        <div className="bb-panel bb-editorial-panel bb-graffiti-texture hidden min-h-80 rotate-1 rounded-2xl p-5 lg:block">
          <div className="flex h-full flex-col justify-between">
            <p className="bb-tag-label text-violet-100">Tonight</p>
            <div>
              <p className="text-5xl font-black uppercase leading-none text-white">
                05
              </p>
              <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                Producers per room
              </p>
            </div>
            <p className="text-sm leading-6 text-zinc-300">
              Raw samples, short clocks, ranked votes.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function HubPanel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof ActivityIcon;
  children?: ReactNode;
}) {
  return (
    <section className="bb-panel-soft bb-editorial-panel bb-paint-edge bb-spotlight-card rounded-xl p-3.5 pl-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-400/10 text-violet-100">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="bb-tag-label text-sm text-white">
            {title}
          </h2>
          {description ? (
            <p className="bb-text-muted mt-1 text-sm leading-5">{description}</p>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function AuthenticatedHub({
  user,
}: {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
}) {
  const rank = user.producerElo !== null ? getRankFromElo(user.producerElo) : null;

  return (
    <GameClientShell user={user}>
      <div className="grid min-h-[calc(100vh-19rem)] gap-5 xl:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1.3fr)_minmax(260px,0.75fr)]">
        <aside className="space-y-5">
          <HubPanel
            title="Operator"
            description=""
            icon={TrophyIcon}
          >
            <div className="rounded-lg border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className="min-w-0 truncate text-sm font-medium text-white"
                  title={user.username}
                >
                  {user.username}
                </p>
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                    getPresenceColorClass(PresenceStatus.ONLINE),
                  )}
                >
                  {getPresenceLabel(PresenceStatus.ONLINE)}
                </span>
              </div>
              <p className="mt-1 text-xs text-violet-200">
                {rank ? getProducerRankName(rank.name) : "Not qualified"}
              </p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="bb-text-muted text-xs uppercase tracking-[0.16em]">
                  Rating
                </span>
                <span className="flex items-center gap-1 text-2xl font-black text-white">
                  <ZapIcon className="size-5 text-violet-200" />
                  {user.producerElo ?? "--"}
                </span>
              </div>
            </div>
          </HubPanel>

          <HubPanel
            title="Live Board"
            description=""
            icon={ActivityIcon}
          >
            <div className="grid gap-3">
              {mockStats.map((stat) => {
                const Icon = stat.icon;

                return (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="size-4 text-violet-200" />
                      <div>
                        <p className="text-sm text-white">{stat.label}</p>
                        <p className="bb-text-muted text-xs">{stat.detail}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-md bg-violet-400/10 px-2 py-1 text-xs font-semibold text-violet-100">
                        {stat.value}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          getPresenceColorClass(stat.status),
                        )}
                      >
                        {getPresenceLabel(stat.status)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </HubPanel>
        </aside>

        <section className="bb-neon-border bb-glow bb-graffiti-texture bb-spotlight-card relative overflow-hidden rounded-2xl bg-black/30 p-5 sm:p-7">
          <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(217,70,239,0.18),transparent_42%,rgba(168,85,247,0.16))]" />
          <div className="relative flex min-h-[26rem] flex-col justify-between">
            <div>
              <p className="bb-tag-label text-sm text-violet-100">
                Main lobby
              </p>
              <h1 className="bb-street-title mt-4 text-7xl sm:text-8xl">
                Play
              </h1>
              <span className="bb-graffiti-accent mt-3 text-2xl opacity-80">
                Open wall
              </span>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Link
                href="/battle"
                className="bb-queue-button bb-spotlight-card inline-flex h-20 items-center justify-center rounded-xl px-8 text-2xl font-black uppercase tracking-[0.18em] text-zinc-950 transition hover:-translate-y-1 hover:scale-[1.01]"
              >
                <SwordsIcon className="mr-3 size-6" />
                Play
              </Link>
              <Link
                href="/shop"
                className="bb-panel-soft inline-flex h-12 items-center justify-center rounded-lg px-5 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
              >
                <ShoppingBagIcon className="mr-2 size-4" />
                Shop
              </Link>
              <Link
                href="/community"
                className="bb-panel-soft inline-flex h-12 items-center justify-center rounded-lg px-5 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
              >
                <UsersIcon className="mr-2 size-4" />
                Community
              </Link>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <HubPanel
            title="Recent Activity"
            description=""
            icon={ActivityIcon}
          >
            <div className="rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-6 text-sm text-zinc-400">
              No recent activity.
            </div>
          </HubPanel>

          <HubPanel
            title="Featured Pack"
            description=""
            icon={Disc3Icon}
          >
            <div className="rounded-lg border border-violet-300/20 bg-violet-400/10 p-4">
              <p className="font-medium text-white">Demo Beat Battle Pack</p>
              <p className="bb-text-muted mt-2 text-sm">Demo loop kit.</p>
            </div>
          </HubPanel>

          <HubPanel
            title="Community News"
            description=""
            icon={NewspaperIcon}
          >
            <div className="rounded-lg border border-violet-300/15 bg-violet-400/10 p-4">
              <p className="text-sm font-medium text-violet-100">
                Community hub
              </p>
              <p className="bb-text-muted mt-2 text-sm">
                Posts and announcements.
              </p>
            </div>
          </HubPanel>
        </aside>
      </div>
    </GameClientShell>
  );
}

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return <PublicHome />;
  }

  return <AuthenticatedHub user={user} />;
}
