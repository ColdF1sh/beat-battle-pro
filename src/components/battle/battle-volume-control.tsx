"use client";

import { Volume2Icon, VolumeXIcon } from "lucide-react";

import { useAudioSettings } from "@/hooks/use-audio-settings";
import { cn } from "@/lib/utils";

export function BattleVolumeControl() {
  const { volume, setVolume, isMuted, toggleMute } = useAudioSettings();
  const sliderValue = isMuted ? 0 : volume;

  return (
    <div className="bb-spotlight-card flex h-10 items-center gap-2 border-white/10 bg-white/[0.04] px-2.5 text-zinc-200">
      <button
        type="button"
        aria-label={isMuted ? "Unmute battle audio" : "Mute battle audio"}
        onClick={toggleMute}
        className="grid size-6 shrink-0 place-items-center rounded-md border border-white/10 bg-black/25 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-300/10 hover:text-white"
      >
        {isMuted ? (
          <VolumeXIcon className="size-3.5 text-rose-200" />
        ) : (
          <Volume2Icon className="size-3.5 text-violet-100" />
        )}
      </button>
      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <span className="bb-tag-label text-[9px] text-violet-200">Vol</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderValue}
          aria-label="Battle master volume"
          onChange={(event) => setVolume(Number(event.target.value))}
          className={cn(
            "h-1.5 w-24 cursor-pointer accent-fuchsia-300 lg:w-28",
            "rounded-full bg-violet-950/70",
          )}
        />
      </div>
      <span className="w-8 text-right font-mono text-[10px] font-bold text-zinc-400">
        {isMuted ? "0" : volume}
      </span>
    </div>
  );
}
