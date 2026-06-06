"use client";

import { GavelIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DRAFT_TURN_SECONDS } from "@/lib/battle/drafting/config";
import type { DraftSnapshot } from "@/lib/battle/drafting/engine";
import { cn } from "@/lib/utils";

type DraftingPanelProps = {
  battleId: string;
  currentUserId: string;
  initialDraft: DraftSnapshot;
};

function formatTurnTime(seconds: number) {
  return `00:${Math.max(0, seconds).toString().padStart(2, "0")}`;
}

export function DraftingPanel({
  battleId,
  currentUserId,
  initialDraft,
}: DraftingPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(DRAFT_TURN_SECONDS);
  const [lockedRuleQueue, setLockedRuleQueue] = useState<
    Array<{ id: string; label: string; value: string }>
  >([]);
  const [activeLockedRule, setActiveLockedRule] = useState<{
    id: string;
    label: string;
    value: string;
  } | null>(null);
  const seenLockedCategoryIdsRef = useRef<Set<string>>(
    new Set(
      initialDraft.categories
        .filter((category) => category.isComplete)
        .map((category) => category.id),
    ),
  );
  const isPollingRef = useRef(false);
  const hasQueuedRefreshRef = useRef(false);

  const activeCategory = useMemo(
    () =>
      draft.currentCategory
        ? draft.categories.find((category) => category.id === draft.currentCategory)
        : null,
    [draft.categories, draft.currentCategory],
  );
  const isCurrentUserTurn =
    draft.currentParticipant?.userId === currentUserId &&
    draft.status === "ACTIVE";

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const newlyLockedCategories = draft.categories.filter(
        (category) =>
          category.isComplete &&
          category.finalOption &&
          !seenLockedCategoryIdsRef.current.has(category.id),
      );

      if (newlyLockedCategories.length === 0) {
        return;
      }

      for (const category of newlyLockedCategories) {
        seenLockedCategoryIdsRef.current.add(category.id);
      }

      setLockedRuleQueue((current) => [
        ...current,
        ...newlyLockedCategories.map((category) => ({
          id: category.id,
          label: category.label,
          value: category.finalOption!,
        })),
      ]);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [draft.categories]);

  useEffect(() => {
    if (activeLockedRule || lockedRuleQueue.length === 0) {
      return;
    }

    const nextLockedRule = lockedRuleQueue[0];
    const timeoutId = window.setTimeout(() => {
      setActiveLockedRule(nextLockedRule);
      setLockedRuleQueue((current) => current.slice(1));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeLockedRule, lockedRuleQueue]);

  useEffect(() => {
    if (!activeLockedRule) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveLockedRule(null);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [activeLockedRule]);

  useEffect(() => {
    if (!draft.turnStartedAt || draft.status !== "ACTIVE") {
      return;
    }

    function updateTimer() {
      const turnStartedAt = new Date(draft.turnStartedAt!).getTime();
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);

      setRemainingSeconds(Math.max(0, DRAFT_TURN_SECONDS - elapsed));
    }

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(intervalId);
  }, [draft.status, draft.turnStartedAt]);

  useEffect(() => {
    let isMounted = true;

    async function refreshDraft() {
      if (isPollingRef.current) {
        return;
      }

      isPollingRef.current = true;

      try {
        const response = await fetch(`/api/battles/${battleId}/draft`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const nextDraft = (await response.json()) as DraftSnapshot;

        if (!isMounted) {
          return;
        }

        setDraft(nextDraft);
        setError(null);
        setSelectedOptions((current) => {
          if (current.length === 0) {
            return current;
          }

          const nextActiveCategory = nextDraft.currentCategory
            ? nextDraft.categories.find(
                (category) => category.id === nextDraft.currentCategory,
              )
            : null;
          const nextAvailableOptions = new Set(
            nextActiveCategory?.options
              .filter((option) => !option.isBanned)
              .map((option) => option.value) ?? [],
          );
          const stillCurrentUserTurn =
            nextDraft.currentParticipant?.userId === currentUserId &&
            nextDraft.status === "ACTIVE";

          return stillCurrentUserTurn &&
            nextActiveCategory?.id === activeCategory?.id &&
            current.every((option) => nextAvailableOptions.has(option))
            ? current
            : [];
        });

        if (nextDraft.status === "COMPLETED" && !hasQueuedRefreshRef.current) {
          hasQueuedRefreshRef.current = true;
          window.setTimeout(() => router.refresh(), 900);
        }
      } catch {
        // Polling is best-effort; the next tick can recover.
      } finally {
        isPollingRef.current = false;
      }
    }

    const intervalId = window.setInterval(refreshDraft, 1000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeCategory?.id, battleId, currentUserId, router]);

  const requiredBanCount = draft.currentRequiredBanCount || 1;

  function toggleDraftOption(optionValue: string) {
    if (!isCurrentUserTurn) {
      return;
    }

    setSelectedOptions((current) => {
      if (current.includes(optionValue)) {
        return current.filter((value) => value !== optionValue);
      }

      return [...current, optionValue].slice(0, requiredBanCount);
    });
  }

  async function submitBan() {
    if (
      selectedOptions.length !== requiredBanCount ||
      !activeCategory ||
      !isCurrentUserTurn
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/battles/${battleId}/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: activeCategory.id,
          options: selectedOptions,
        }),
      });
      const data = (await response.json()) as DraftSnapshot | { error?: string };

      if (!response.ok) {
        setError(
          "error" in data && data.error
            ? data.error
            : "Could not submit ban.",
        );
        return;
      }

      setDraft(data as DraftSnapshot);
      setSelectedOptions([]);
      setError(null);

      if ((data as DraftSnapshot).status === "COMPLETED") {
        window.setTimeout(() => router.refresh(), 900);
      }
    } catch {
      setError("Could not submit ban.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedOptionStates = activeCategory?.options.filter(
    (option) => selectedOptions.includes(option.value),
  );
  const isSelectedOptionBanned = Boolean(
    selectedOptionStates?.some((option) => option.isBanned),
  );
  const isBanButtonDisabled =
    !isCurrentUserTurn ||
    selectedOptions.length !== requiredBanCount ||
    isSelectedOptionBanned ||
    isSubmitting ||
    Boolean(activeCategory?.isComplete);

  return (
    <div className="space-y-5" data-testid="drafting-panel">
      {activeLockedRule ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="bb-ban-reveal border border-fuchsia-300/35 bg-black/75 px-8 py-6 text-center shadow-[0_0_70px_rgba(217,70,239,0.22)]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-100">
              {activeLockedRule.label} locked
            </p>
            <p className="bb-graffiti-accent mt-3 text-5xl sm:text-7xl">
              {activeLockedRule.value}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="bb-street-title mt-2 text-4xl text-white">
              Draft the rules
            </h3>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 px-5 py-4 text-center">
            <p className="font-mono text-3xl font-black text-violet-100">
              {formatTurnTime(remainingSeconds)}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
              Turn clock
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {draft.categories.map((category) => (
            <div
              key={category.id}
              className={cn(
                "rounded-xl border p-3 transition",
                draft.currentCategory === category.id
                  ? "border-violet-300/50 bg-violet-400/10"
                  : category.isComplete
                    ? "border-fuchsia-300/30 bg-fuchsia-400/10"
                    : "border-white/10 bg-black/25",
              )}
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                {category.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {category.finalOption ?? "Banning"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {draft.status === "COMPLETED" ? (
        <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-6 text-center">
          <SparklesIcon className="mx-auto size-9 text-violet-200" />
          <h3 className="bb-street-title mt-3 text-4xl text-white">
            Rules locked
          </h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {Object.entries(draft.finalRules)
              .filter(([key]) => key !== "durationMinutes")
              .map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                    {key}
                  </p>
                  <p className="mt-1 font-semibold text-white">{value}</p>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">
                  Current category
                </p>
                <h4 className="mt-1 text-2xl font-black uppercase text-white">
                  {activeCategory?.label ?? "Complete"}
                </h4>
              </div>
              <GavelIcon className="size-7 text-fuchsia-200" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeCategory?.options.map((option) => {
                const isBanned = option.isBanned;
                const isSelected = selectedOptions.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!isCurrentUserTurn || isBanned}
                    onClick={() => toggleDraftOption(option.value)}
                    className={cn(
                      "min-h-24 rounded-xl border p-4 text-left transition",
                      isSelected
                        ? "border-violet-200 bg-violet-300 text-zinc-950 shadow-[0_0_26px_rgba(168,85,247,0.35)]"
                        : "border-white/10 bg-white/[0.04] text-white hover:border-fuchsia-200/50 hover:bg-fuchsia-300/10",
                      isBanned &&
                        "cursor-not-allowed border-rose-300/20 bg-rose-950/20 text-zinc-500 line-through opacity-60",
                    )}
                  >
                    <span className="text-lg font-black uppercase">
                      {option.value}
                    </span>
                    {option.bannedBy ? (
                      <span className="mt-2 block text-xs no-underline">
                        Banned by {option.bannedBy}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
              On deck
            </p>
            <p className="mt-2 text-xl font-black text-white">
              {draft.currentParticipant?.username ?? "Complete"}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {isCurrentUserTurn
                ? activeCategory?.id === "key" && requiredBanCount > 1
                  ? `Select ${requiredBanCount} notes.`
                  : "Your ban."
                : `Waiting for ${draft.currentParticipant?.username ?? "the current producer"}.`}
            </p>
            {selectedOptions.length > 0 ? (
              <p className="mt-3 rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-100">
                Selected: {selectedOptions.join(", ")}
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {error}
              </p>
            ) : null}

            {isCurrentUserTurn ? (
              <Button
                type="button"
                disabled={isBanButtonDisabled}
                onClick={submitBan}
                className="bb-queue-button mt-5 h-12 w-full text-zinc-950"
              >
                {isSubmitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {activeCategory?.id === "key"
                  ? requiredBanCount === 1
                    ? "Ban note"
                    : `Ban ${requiredBanCount} notes`
                  : "Ban option"}
              </Button>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
