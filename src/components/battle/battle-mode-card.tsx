"use client";

import {
  CheckIcon,
  LockIcon,
  TimerIcon,
  UsersIcon,
} from "lucide-react";

import type { BattleMode } from "@/lib/battle/modes";
import { cn } from "@/lib/utils";

type BattleModeCardProps = {
  mode: BattleMode;
  isSelected: boolean;
  onSelect: () => void;
  isDisabled: boolean;
};

function formatDuration(mode: BattleMode) {
  if (mode.requiresDrafting) {
    return "Drafted timer";
  }

  if (mode.allowedDurationMinutes.length > 1) {
    return `${mode.defaultDurationMinutes} min default`;
  }

  return `${mode.defaultDurationMinutes} min`;
}

export function BattleModeCard({
  mode,
  isSelected,
  onSelect,
  isDisabled,
}: BattleModeCardProps) {
  const isLocked = mode.status === "coming-soon" || !mode.isEnabled;

  return (
    <button
      type="button"
      data-watermark={mode.category === "rap" ? "MC" : "BEAT"}
      data-testid={`battle-mode-${mode.id}`}
      data-selected={isSelected ? "true" : "false"}
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        "bb-flyer-card bb-ripped-edge group relative min-h-[19rem] p-0 text-left transition duration-700",
        "focus-visible:ring-3 focus-visible:ring-violet-300/40 focus-visible:outline-none",
        isSelected
          ? "-rotate-1 translate-x-[-3px] translate-y-[-3px] border-[var(--bb-toxic)] shadow-[10px_10px_0_rgba(0,0,0,0.65)]"
          : "hover:-translate-x-1 hover:-translate-y-2 hover:rotate-[0.6deg] hover:border-[var(--bb-rust)]",
        isDisabled && "cursor-not-allowed opacity-60 hover:translate-y-0",
      )}
    >
      <div className="absolute left-3 top-3 z-10 h-16 w-1.5 bg-[var(--bb-toxic)] opacity-85" />
      <div className="absolute right-3 top-3 z-10 h-10 w-10 border border-white/15 bg-black/30" />

      {isLocked ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <span className="bb-chrome-border inline-flex -rotate-2 items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-200">
            <LockIcon className="size-4" />
            Locked
          </span>
        </div>
      ) : null}

      <div className="relative z-10 flex h-full min-h-[19rem] flex-col justify-between p-5 pl-7">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="bb-tag-label text-[10px]">
                {mode.category === "rap" ? "Rap battle" : "Producer battle"}
              </p>
              <h3 className="bb-kinetic-title mt-3 max-w-[10rem] text-5xl text-white">
                {mode.name}
              </h3>
            </div>
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center border transition",
                isSelected
                  ? "border-[var(--bb-toxic)] bg-[var(--bb-toxic)] text-zinc-950"
                  : "border-white/15 bg-black/30 text-zinc-500",
              )}
            >
              {isSelected ? <CheckIcon className="size-5" /> : null}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 border border-white/10 bg-black/45 px-2.5 py-1.5 text-xs font-bold uppercase text-zinc-200">
              <UsersIcon className="size-4 text-[var(--bb-toxic)]" />
              {mode.players}
            </span>
            <span className="inline-flex items-center gap-2 border border-white/10 bg-black/45 px-2.5 py-1.5 text-xs font-bold uppercase text-zinc-200">
              <TimerIcon className="size-4 text-[var(--bb-danger)]" />
              {formatDuration(mode)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {mode.rules.slice(0, 3).map((rule) => (
              <span
                key={rule}
                className="border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300"
              >
                {rule}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
