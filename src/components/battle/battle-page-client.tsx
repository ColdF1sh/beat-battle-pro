"use client";

import {
  ClockIcon,
  Gamepad2Icon,
  RadioIcon,
  RotateCcwIcon,
  SearchIcon,
  ServerIcon,
  SwordsIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { BattleModeCard } from "@/components/battle/battle-mode-card";
import { MatchmakingStatePanel } from "@/components/matchmaking/matchmaking-state-panel";
import { Button } from "@/components/ui/button";
import { gameButtonClassName } from "@/components/ui/game-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { battleModes, beatmakingModes, rapModes } from "@/lib/battle/modes";

type MatchmakingSearchResponse =
  | {
      status: "matched";
      battleId: string;
      mode: string;
    }
  | {
      status: "searching";
      queuedModes: string[];
    };

type MatchmakingStatusResponse =
  | {
      status: "matched";
      battleId: string;
    }
  | {
      status: "searching";
      queuedModes: string[];
    }
  | {
      status: "idle";
    };

type ApiErrorResponse = {
  error?: string;
  details?: unknown;
};

async function parseApiResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as MatchmakingSearchResponse | ApiErrorResponse;
  } catch {
    return {
      error: response.ok
        ? "Invalid server response."
        : "Failed to start matchmaking. Check server logs.",
    };
  }
}

function getSearchErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.length > 0
  ) {
    return data.error;
  }

  return "Failed to start matchmaking. Check server logs.";
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

type BattlePageClientProps = {
  enableDevFakePlayers: boolean;
};

export function BattlePageClient({
  enableDevFakePlayers,
}: BattlePageClientProps) {
  const router = useRouter();
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [queuedModes, setQueuedModes] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [matchedBattle, setMatchedBattle] = useState<{
    battleId: string;
    mode?: string;
  } | null>(null);
  const [matchmakingMessage, setMatchmakingMessage] = useState<string | null>(
    null,
  );
  const [matchmakingError, setMatchmakingError] = useState<string | null>(null);

  const selectedBattleModes = useMemo(
    () => battleModes.filter((mode) => selectedModes.includes(mode.id)),
    [selectedModes],
  );
  const selectedModeNames = useMemo(
    () => selectedBattleModes.map((mode) => mode.name),
    [selectedBattleModes],
  );
  const queuedModeNames = useMemo(
    () =>
      battleModes
        .filter((mode) => queuedModes.includes(mode.id))
        .map((mode) => mode.name),
    [queuedModes],
  );
  const matchedBattleMode = useMemo(
    () => battleModes.find((mode) => mode.id === matchedBattle?.mode),
    [matchedBattle],
  );
  const canFindBattle =
    selectedModes.length > 0 && !isSearching && !isSubmitting && !matchedBattle;
  const visibleQueueModeNames =
    queuedModeNames.length > 0 ? queuedModeNames : selectedModeNames;
  const matchmakingPanelState = matchedBattle
    ? "matched"
    : isSearching
      ? "searching"
      : matchmakingError
        ? "error"
        : "idle";

  useEffect(() => {
    if (!isSearching) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (searchStartedAt) {
        setElapsedSeconds(Math.floor((Date.now() - searchStartedAt) / 1000));
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isSearching, searchStartedAt]);

  useEffect(() => {
    if (!matchedBattle) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      router.push(`/battle/${matchedBattle.battleId}`);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [matchedBattle, router]);

  useEffect(() => {
    if (!isSearching) {
      return;
    }

    let isMounted = true;

    async function pollMatchmakingStatus() {
      try {
        const response = await fetch("/api/matchmaking/status", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as MatchmakingStatusResponse;

        if (!isMounted) {
          return;
        }

        if (data.status === "matched") {
          setMatchedBattle({
            battleId: data.battleId,
            mode: queuedModes[0] ?? selectedModes[0],
          });
          setIsSearching(false);
          setQueuedModes([]);
          setSearchStartedAt(null);
          return;
        }

        if (data.status === "searching") {
          setQueuedModes(data.queuedModes);
        }

        if (data.status === "idle") {
          setIsSearching(false);
          setQueuedModes([]);
          setSearchStartedAt(null);
          setElapsedSeconds(0);
        }
      } catch {
        if (isMounted) {
          setMatchmakingError("Still searching. Retrying status check...");
        }
      }
    }

    pollMatchmakingStatus();
    const intervalId = window.setInterval(pollMatchmakingStatus, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [isSearching, queuedModes, router, selectedModes]);

  function toggleMode(modeId: string) {
    if (isSearching || matchedBattle) {
      return;
    }

    setSelectedModes((currentModes) =>
      currentModes.includes(modeId)
        ? currentModes.filter((selectedModeId) => selectedModeId !== modeId)
        : [...currentModes, modeId],
    );
  }

  async function handleFindBattle() {
    if (!canFindBattle) {
      return;
    }

    setIsSubmitting(true);
    setMatchmakingError(null);
    setMatchmakingMessage(null);
    setMatchedBattle(null);

    try {
      const response = await fetch("/api/matchmaking/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modes: selectedModes,
        }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        const message = getSearchErrorMessage(data);

        console.error("Matchmaking search failed:", {
          status: response.status,
          statusText: response.statusText,
          error: message,
          response: data,
        });
        setMatchmakingError(message);
        return;
      }

      if (data && "status" in data && data.status === "matched") {
        setMatchedBattle({
          battleId: data.battleId,
          mode: data.mode,
        });
        return;
      }

      if (data && "status" in data && data.status === "searching") {
        setQueuedModes(data.queuedModes);
        setSearchStartedAt(Date.now());
        setElapsedSeconds(0);
        setIsSearching(true);
        return;
      }

      setMatchmakingError("Failed to start matchmaking. Check server logs.");
    } catch {
      console.error("Matchmaking search request failed.");
      setMatchmakingError("Could not start matchmaking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelSearch() {
    if (!isSearching || isCancelling) {
      return;
    }

    setIsCancelling(true);
    setMatchmakingError(null);
    setMatchmakingMessage(null);

    try {
      const response = await fetch("/api/matchmaking/cancel", {
        method: "POST",
      });
      const data = (await response.json()) as
        | { status: "cancelled" }
        | { error?: string };

      if (!response.ok) {
        setMatchmakingError(
          "error" in data && data.error
            ? data.error
            : "Could not cancel search. Please try again.",
        );
        return;
      }

      setIsSearching(false);
      setQueuedModes([]);
      setSearchStartedAt(null);
      setElapsedSeconds(0);
      setMatchedBattle(null);
      setMatchmakingMessage("Search cancelled.");
    } catch {
      setMatchmakingError("Could not cancel search. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleFillWithFakePlayers() {
    const mode = queuedModes[0] ?? selectedModes[0];

    if (!mode) {
      setMatchmakingError("Select a mode before filling with fake players.");
      return;
    }

    setMatchmakingError(null);

    try {
      const response = await fetch("/api/dev/fake-matchmaking/fill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
        }),
      });
      const data = (await response.json()) as
        | { status: "matched"; battleId: string }
        | { error?: string };

      if (!response.ok) {
        setMatchmakingError(
          "error" in data && data.error
            ? data.error
            : "Could not fill the room with fake players.",
        );
        return;
      }

      if ("status" in data && data.status === "matched") {
        setIsSearching(false);
        setQueuedModes([]);
        setMatchedBattle({
          battleId: data.battleId,
          mode,
        });
      }
    } catch {
      setMatchmakingError("Could not fill the room with fake players.");
    }
  }

  return (
    <section className="relative -mx-2 space-y-4 overflow-hidden px-2 pb-28" data-testid="battle-page">
      <MatchmakingStatePanel
        state={matchmakingPanelState}
        elapsedTime={formatElapsed(elapsedSeconds)}
        modeNames={visibleQueueModeNames}
        matchedModeName={matchedBattleMode?.name ?? visibleQueueModeNames[0]}
        producerCount={matchedBattleMode?.maxPlayers ?? 5}
        errorMessage={matchmakingError}
        isCancelling={isCancelling}
        onCancel={handleCancelSearch}
        enableDevFakePlayers={enableDevFakePlayers}
        onFillWithFakePlayers={handleFillWithFakePlayers}
      />

      <div className="bb-raw-stage bb-ripped-edge relative min-h-[13rem] p-5 sm:p-7">
        <div className="relative z-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="bb-tag-label text-xs">Queue wall</p>
            <h1 className="bb-kinetic-title mt-2 max-w-4xl text-6xl text-white sm:text-8xl lg:text-9xl">
              Pick your fight.
            </h1>
          </div>
          <div className="hidden rotate-1 border-l border-fuchsia-300/30 bg-black/25 p-4 text-sm font-black uppercase tracking-[0.18em] text-zinc-300 lg:block">
            Five producers enter. One track survives the room.
          </div>
        </div>
      </div>

      <Tabs defaultValue="producer" className="gap-4">
        <TabsList className="mx-auto flex h-12 w-full max-w-4xl justify-center rounded-none border-y border-white/10 bg-black/40 p-0 text-zinc-400">
          <TabsTrigger
            value="producer"
            data-testid="battle-tab-search"
            className="bb-brutal-tab h-12 flex-1 px-3 text-xs font-black uppercase tracking-[0.16em] data-active:bg-[var(--bb-toxic)] data-active:text-zinc-950"
          >
            <SearchIcon className="size-4" />
            Producer Battles
          </TabsTrigger>
          <TabsTrigger
            value="rap"
            data-testid="battle-tab-rap"
            className="bb-brutal-tab h-12 flex-1 px-3 text-xs font-black uppercase tracking-[0.16em] data-active:bg-[var(--bb-toxic)] data-active:text-zinc-950"
          >
            <SwordsIcon className="size-4" />
            Rap Battles
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            data-testid="battle-tab-custom"
            className="bb-brutal-tab h-12 flex-1 px-3 text-xs font-black uppercase tracking-[0.16em] data-active:bg-[var(--bb-danger)] data-active:text-white"
          >
            <ServerIcon className="size-4" />
            Custom Servers
          </TabsTrigger>
          <TabsTrigger
            value="mini"
            disabled
            className="bb-brutal-tab h-12 flex-1 px-3 text-xs font-black uppercase tracking-[0.16em] opacity-45"
          >
            <Gamepad2Icon className="size-4" />
            Mini Games
          </TabsTrigger>
        </TabsList>

        <TabsContent value="producer">
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
            {beatmakingModes.map((mode) => (
              <BattleModeCard
                key={mode.id}
                mode={mode}
                isSelected={selectedModes.includes(mode.id)}
                isDisabled={
                  !mode.isEnabled || isSearching || Boolean(matchedBattle)
                }
                onSelect={() => toggleMode(mode.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rap">
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rapModes.map((mode) => (
              <BattleModeCard
                key={mode.id}
                mode={mode}
                isSelected={selectedModes.includes(mode.id)}
                isDisabled={
                  !mode.isEnabled || isSearching || Boolean(matchedBattle)
                }
                onSelect={() => toggleMode(mode.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="custom">
          <section className="bb-raw-stage bb-ripped-edge relative p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--bb-glow-violet),transparent_58%)]" />
            <div className="relative grid gap-5 lg:grid-cols-[1fr_320px]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  <ClockIcon className="size-4" />
                  Coming soon
                </span>
                <h2 className="mt-5 text-4xl font-black uppercase tracking-[0.1em] text-white">
                  Custom Servers
                </h2>
                <p className="bb-text-muted mt-3 max-w-2xl text-sm leading-6">
                  Private rooms, invite codes, custom rules, and room controls.
                </p>
              </div>
              <div className="grid gap-3">
                {[
                  ["Public rooms", RadioIcon],
                  ["Private invite codes", ServerIcon],
                  ["Custom rule sets", SwordsIcon],
                ].map(([label, Icon]) => {
                  const FeatureIcon = Icon as typeof RadioIcon;

                  return (
                    <div
                      key={label as string}
                      className="bb-panel-soft flex items-center gap-3 rounded-xl px-4 py-4 text-zinc-300"
                    >
                      <FeatureIcon className="size-5 text-violet-200" />
                      <span className="text-sm font-medium">
                        {label as string}
                      </span>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  disabled
                  className="mt-2 h-12 bg-white/10 text-zinc-500"
                >
                  Create Server
                </Button>
              </div>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="mini">
          <section className="bb-panel-soft rounded-xl p-6 text-center text-zinc-400">
            Mini Games are coming soon.
          </section>
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-5 left-1/2 z-40 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 border border-white/12 bg-black/90 p-3 shadow-[9px_9px_0_rgba(0,0,0,0.64)] backdrop-blur-xl">
        <div className="absolute -top-3 left-8 bg-[var(--bb-toxic)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-950">
          Start queue
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
              Selected
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {selectedModeNames.length > 0
                ? selectedModeNames.join(" / ")
                : "Choose a mode"}
            </p>
            {matchmakingError ? (
              <p className="mt-1 text-xs text-rose-200">{matchmakingError}</p>
            ) : matchmakingMessage ? (
              <p className="mt-1 text-xs text-violet-100">
                {matchmakingMessage}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="clear-selection"
              disabled={
                selectedModes.length === 0 ||
                isSearching ||
                Boolean(matchedBattle)
              }
              onClick={() => setSelectedModes([])}
              className="h-11 border-white/10 bg-white/[0.04] px-3 text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              <RotateCcwIcon className="size-4" />
            </Button>
            <Button
              type="button"
              data-testid="find-battle"
              disabled={!canFindBattle}
              onClick={handleFindBattle}
              className={gameButtonClassName("danger", "h-14 min-w-52 text-2xl")}
            >
              {isSubmitting ? "..." : "GO"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
