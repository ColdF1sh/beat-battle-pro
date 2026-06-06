"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  RadioIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type MatchmakingPanelState = "idle" | "searching" | "matched" | "error";

type MatchmakingStatePanelProps = {
  state: MatchmakingPanelState;
  elapsedTime?: string;
  modeNames?: string[];
  matchedModeName?: string;
  producerCount?: number;
  errorMessage?: string | null;
  isCancelling?: boolean;
  onCancel?: () => void;
  enableDevFakePlayers?: boolean;
  onFillWithFakePlayers?: () => void;
};

export function MatchmakingStatePanel({
  state,
  elapsedTime = "00:00",
  modeNames = [],
  matchedModeName,
  producerCount = 5,
  errorMessage,
  isCancelling = false,
  onCancel,
  enableDevFakePlayers = false,
  onFillWithFakePlayers,
}: MatchmakingStatePanelProps) {
  return (
    <AnimatePresence>
      {state !== "idle" ? (
        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.96, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -12 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="bb-panel fixed inset-x-4 top-24 z-40 mx-auto max-w-4xl rounded-2xl p-6 shadow-2xl md:top-28"
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state === "searching" ? (
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <span className="bb-glow flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Loader2Icon className="size-7 animate-spin" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200">
                    Matchmaking
                  </p>
                  <h2 className="mt-2 text-3xl font-black uppercase tracking-[0.08em] text-white">
                    Searching for battle...
                  </h2>
                  <p className="bb-text-muted mt-2 text-sm">
                    Searching for:{" "}
                    {modeNames.length > 0 ? modeNames.join(", ") : "selected modes"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="bb-panel-soft rounded-lg px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Elapsed
                  </p>
                  <p className="mt-1 font-mono text-2xl font-black text-white">
                    {elapsedTime}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isCancelling}
                  onClick={onCancel}
                  className="h-12 border-rose-300/30 bg-rose-500/10 px-5 text-rose-100 hover:bg-rose-500/20 hover:text-white"
                >
                  {isCancelling ? "Cancelling..." : "Cancel Search"}
                </Button>
                {enableDevFakePlayers ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onFillWithFakePlayers}
                    className="h-12 border-fuchsia-300/40 bg-fuchsia-400/10 px-5 text-fuchsia-100 hover:bg-fuchsia-400/20 hover:text-white"
                  >
                    DEV ONLY · Fill with fake players
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {state === "matched" ? (
            <div className="relative overflow-hidden rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/10 p-6 text-center">
              <motion.div
                className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,0.26),transparent_55%)]"
                animate={{ opacity: [0.45, 0.85, 0.45] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative">
                <motion.div
                  initial={{ scale: 0.82 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-fuchsia-300 text-zinc-950 shadow-[0_0_42px_rgba(217,70,239,0.45)]"
                >
                  <CheckCircle2Icon className="size-9" />
                </motion.div>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-fuchsia-100">
                  Matchmaking
                </p>
                <h2 className="mt-2 text-5xl font-black uppercase tracking-[0.16em] text-white">
                  Match Found
                </h2>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold text-zinc-200">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2">
                    <RadioIcon className="size-4 text-violet-200" />
                    {matchedModeName ?? "Selected mode"}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2">
                    <UsersIcon className="size-4 text-fuchsia-200" />
                    {producerCount} producers ready
                  </span>
                </div>
                <div className="mx-auto mt-6 h-2 max-w-sm overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-100"
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
                <p className="mt-3 text-sm text-fuchsia-100/80">
                  Entering battle room...
                </p>
              </div>
            </div>
          ) : null}

          {state === "error" ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-500/10 text-rose-200">
                <AlertTriangleIcon className="size-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">
                  Matchmaking error
                </p>
                <p className="mt-2 text-sm text-zinc-200">
                  {errorMessage ?? "Could not start matchmaking. Please try again."}
                </p>
              </div>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
