"use client";

import {
  ChevronDownIcon,
  LogOutIcon,
  Mic2Icon,
  UserIcon,
  ZapIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getPresenceColorClass,
  getPresenceLabel,
  PresenceStatus,
} from "@/lib/presence/status";
import {
  getProducerRankName,
  getRankFromElo,
  getRapRankName,
} from "@/lib/ranking/elo-config";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  user: {
    username: string;
    displayName?: string | null;
    avatarUrl: string | null;
    eloRating: number;
    producerElo?: number | null;
    rapElo?: number | null;
  };
  triggerTestId?: string;
};

export function UserMenu({
  user,
  triggerTestId = "user-menu-trigger",
}: UserMenuProps) {
  const label = user.username;
  const initials = label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const presenceStatus = PresenceStatus.ONLINE;
  const producerElo = user.producerElo ?? null;
  const rapElo = user.rapElo ?? null;
  const producerRank =
    producerElo !== null
      ? getProducerRankName(getRankFromElo(producerElo).name)
      : null;
  const rapRank = rapElo !== null ? getRapRankName(getRankFromElo(rapElo).name) : null;
  const rankCards = [
    {
      id: "producer",
      icon: ZapIcon,
      elo: producerElo,
      rank: producerRank,
      fallback: "Producer: Not qualified",
      className: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    },
    {
      id: "rap",
      icon: Mic2Icon,
      elo: rapElo,
      rank: rapRank,
      fallback: "Rap: Not qualified",
      className: "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100",
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          data-testid={triggerTestId}
          variant="outline"
          className="h-11 justify-between gap-3 border-violet-300/15 bg-black/35 px-2 text-left text-zinc-100 shadow-[0_0_24px_rgba(168,85,247,0.08)] hover:border-violet-200/30 hover:bg-white/10 hover:text-white"
        >
          <Avatar className="bg-zinc-900">
            {user.avatarUrl ? (
              <AvatarImage
                src={user.avatarUrl}
                alt={label}
                className="object-cover object-center"
              />
            ) : null}
            <AvatarFallback className="bg-violet-950 text-xs font-semibold text-violet-100">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block max-w-28 truncate text-sm font-black sm:max-w-36" title={label}>
              {label}
            </span>
            <span className="flex items-center gap-2 text-xs text-violet-200">
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                  getPresenceColorClass(presenceStatus),
                )}
              >
                {getPresenceLabel(presenceStatus)}
              </span>
            </span>
          </span>
          <ChevronDownIcon className="size-4 text-zinc-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bb-graffiti-texture w-72 overflow-hidden border-violet-300/20 bg-zinc-950/98 p-1 text-zinc-100 shadow-2xl shadow-fuchsia-950/35 backdrop-blur"
      >
        <DropdownMenuLabel className="p-0">
          <div className="border border-violet-300/15 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-12 border border-violet-300/20 bg-zinc-900">
                {user.avatarUrl ? (
                  <AvatarImage
                    src={user.avatarUrl}
                    alt={label}
                    className="object-cover object-center"
                  />
                ) : null}
                <AvatarFallback className="bg-violet-950 text-sm font-black text-violet-100">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span
                  className="block truncate text-sm font-black uppercase tracking-[0.08em] text-white"
                  title={label}
                >
                  {label}
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {rankCards.map((card) => {
                const Icon = card.icon;

                return (
                  <div
                    key={card.id}
                    className={cn(
                      "flex items-center gap-2 border px-2.5 py-2",
                      card.className,
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center border border-white/10 bg-black/25">
                      <Icon className="size-4" />
                    </span>
                    {card.elo !== null && card.rank ? (
                      <div className="min-w-0">
                        <div className="text-xl font-black leading-none text-white">
                          {card.elo}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] font-black uppercase tracking-[0.14em]">
                          {card.rank}
                        </div>
                      </div>
                    ) : (
                      <div className="truncate text-xs font-black uppercase tracking-[0.12em] text-zinc-400">
                        {card.fallback}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <span
            className={cn(
              "mx-3 mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
              getPresenceColorClass(presenceStatus),
            )}
          >
            {getPresenceLabel(presenceStatus)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-2 bg-violet-300/15" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-md border border-transparent px-3 py-2 font-bold uppercase tracking-[0.08em] text-zinc-200 focus:border-violet-300/20 focus:bg-violet-300/10 focus:text-white"
        >
          <Link href={`/profile/${encodeURIComponent(user.username)}`}>
            <UserIcon className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="sign-out-menu-item"
          className="cursor-pointer rounded-md border border-transparent px-3 py-2 font-bold uppercase tracking-[0.08em] text-rose-200 focus:border-rose-300/20 focus:bg-rose-500/10 focus:text-rose-100"
          onSelect={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
