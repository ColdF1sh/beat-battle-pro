"use client";

import {
  SettingsIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAudioSettings } from "@/hooks/use-audio-settings";

export function SettingsMenu() {
  const { volume, setVolume, isMuted, toggleMute } = useAudioSettings();
  const sliderValue = isMuted ? 0 : volume;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Open settings"
          className="bb-spotlight-card size-10 border-white/10 bg-white/[0.04] text-zinc-300 transition hover:-translate-y-0.5 hover:border-fuchsia-300/40 hover:bg-fuchsia-400/10 hover:text-white"
        >
          <SettingsIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bb-graffiti-texture w-72 border-fuchsia-300/20 bg-[var(--bb-panel)] p-3 text-[var(--bb-foreground)] shadow-[0_24px_80px_rgba(0,0,0,0.35),0_0_32px_var(--bb-glow-violet)] backdrop-blur-xl"
      >
        <DropdownMenuLabel className="bb-tag-label px-2 text-xs text-violet-100">
          Settings
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-white/10" />
        <div
          className="space-y-3 px-2 py-2"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                onClick={toggleMute}
                className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-400/10 hover:text-white"
              >
                {isMuted ? (
                  <VolumeXIcon className="size-4 text-rose-200" />
                ) : (
                  <Volume2Icon className="size-4 text-violet-200" />
                )}
              </button>
              <span className="text-sm font-bold text-white">
                Volume
              </span>
            </div>
            <span className="font-mono text-xs text-zinc-400">
              {isMuted ? "Muted" : `${volume}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            aria-label="Volume"
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-fuchsia-400"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
