"use client";

import { AlertTriangleIcon, RadioIcon, SwordsIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { gameButtonClassName } from "@/components/ui/game-button";

type ActiveBattle = {
  id: string;
  mode?: string;
};

type ActiveBattleResponse = {
  battle: ActiveBattle | null;
};

const dismissedStorageKey = "beat-battle-dismissed-active-battles";

function readDismissedBattleIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(dismissedStorageKey);
    const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : [];

    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function writeDismissedBattleIds(ids: Set<string>) {
  window.localStorage.setItem(
    dismissedStorageKey,
    JSON.stringify(Array.from(ids).slice(-20)),
  );
}

export function ActiveMatchGate({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeBattle, setActiveBattle] = useState<ActiveBattle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissedBattleIdsRef = useRef<Set<string>>(new Set());
  const isPollingRef = useRef(false);
  const isBattleRoom = /^\/battle\/[^/]+/.test(pathname);
  const shouldCheck = enabled && !isBattleRoom;

  useEffect(() => {
    dismissedBattleIdsRef.current = readDismissedBattleIds();
  }, []);

  const dismissBattleLocally = useCallback((battleId: string) => {
    const nextDismissed = new Set(dismissedBattleIdsRef.current);
    nextDismissed.add(battleId);
    dismissedBattleIdsRef.current = nextDismissed;
    writeDismissedBattleIds(nextDismissed);
  }, []);

  const loadActiveBattle = useCallback(async () => {
    if (!shouldCheck || isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;

    try {
      const response = await fetch("/api/battles/active", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as ActiveBattleResponse;
      const nextBattle = data.battle;

      if (!nextBattle) {
        setActiveBattle(null);
        setIsConfirmingAbandon(false);
        return;
      }

      if (dismissedBattleIdsRef.current.has(nextBattle.id)) {
        setActiveBattle(null);
        setIsConfirmingAbandon(false);
        return;
      }

      setActiveBattle((current) =>
        current?.id === nextBattle.id ? current : nextBattle,
      );
    } catch {
      // Active lock is also enforced server-side by matchmaking.
    } finally {
      isPollingRef.current = false;
    }
  }, [shouldCheck]);

  useEffect(() => {
    if (!shouldCheck) {
      return;
    }

    const initialTimeoutId = window.setTimeout(loadActiveBattle, 0);
    const intervalId = window.setInterval(loadActiveBattle, 30_000);

    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [loadActiveBattle, shouldCheck]);

  if (!shouldCheck || !activeBattle) {
    return null;
  }

  const abandonPenaltyLabel = `-30 ${
    activeBattle.mode?.startsWith("rap_") ? "Rap" : "Producer"
  } ELO`;

  async function reconnect() {
    if (!activeBattle || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/battles/${activeBattle.id}/reconnect`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | { redirectTo?: string; error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not reconnect.");
        return;
      }

      router.push(data?.redirectTo ?? `/battle/${activeBattle.id}`);
      router.refresh();
    } catch {
      setError("Could not reconnect. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function abandon() {
    if (!activeBattle || isLoading) {
      return;
    }

    const battleId = activeBattle.id;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/battles/${battleId}/abandon`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Could not abandon match.");
        return;
      }

      dismissBattleLocally(battleId);
      setActiveBattle(null);
      setIsConfirmingAbandon(false);
      await loadActiveBattle();
      router.refresh();
    } catch {
      setError("Could not abandon match.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <aside className="fixed bottom-4 right-4 z-[9998] w-[min(25rem,calc(100vw-2rem))] animate-in slide-in-from-bottom-3 duration-300">
        <div className="bb-graffiti-texture relative overflow-hidden border border-fuchsia-300/35 bg-zinc-950/95 p-4 text-white shadow-[0_0_70px_rgba(168,85,247,0.3)] backdrop-blur-xl">
          <div className="pointer-events-none absolute right-0 top-0 h-14 w-14 border-r-2 border-t-2 border-fuchsia-300/35" />
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center border border-fuchsia-300/30 bg-fuchsia-300/15 text-fuchsia-100">
              <RadioIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-black uppercase tracking-[0.14em] text-white">
                  Match in progress
                </h2>
                <button
                  type="button"
                  aria-label="Hide reconnect notification"
                  onClick={() => {
                    dismissBattleLocally(activeBattle.id);
                    setActiveBattle(null);
                  }}
                  className="rounded-md border border-white/10 bg-white/[0.04] p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-zinc-300">
                You have an unfinished competitive battle.
              </p>
              <p className="mt-2 inline-flex items-center gap-2 border border-rose-300/25 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-100">
                <AlertTriangleIcon className="size-3.5" />
                Abandon penalty: {abandonPenaltyLabel}
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-3 border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={reconnect}
              className={gameButtonClassName("primary", "h-10 w-full px-3 text-xs")}
            >
              <SwordsIcon className="size-3.5" />
              Reconnect
            </button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => setIsConfirmingAbandon(true)}
              className="h-10 border-rose-300/30 bg-rose-500/10 text-xs font-black uppercase tracking-[0.1em] text-rose-100 hover:bg-rose-500/20 hover:text-white"
            >
              Leave match
            </Button>
          </div>
        </div>
      </aside>

      {isConfirmingAbandon ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="bb-graffiti-texture w-full max-w-[430px] border border-rose-300/40 bg-zinc-950 p-5 text-white shadow-[0_0_90px_rgba(244,63,94,0.34)]">
            <h2 className="bb-kinetic-title text-[clamp(2rem,7vw,3.5rem)] leading-none text-white">
              Abandon match?
            </h2>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              This will count as leaving a competitive battle and apply a
              one-time {abandonPenaltyLabel} penalty.
            </p>
            {error ? (
              <p className="mt-4 border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => setIsConfirmingAbandon(false)}
                className="h-11 border-white/15 bg-white/[0.04] text-zinc-100 hover:bg-white/10"
              >
                Cancel
              </Button>
              <button
                type="button"
                disabled={isLoading}
                onClick={abandon}
                className={gameButtonClassName("danger", "h-11 w-full px-4")}
              >
                {isLoading ? "Abandoning..." : "Abandon match"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
