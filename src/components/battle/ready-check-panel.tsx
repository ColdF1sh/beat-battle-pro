"use client";

import { CheckIcon, Loader2Icon, UsersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { GameButton } from "@/components/ui/game-button";
import { cn } from "@/lib/utils";

type ReadyParticipant = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isReady: boolean;
  isCurrentUser: boolean;
};

type ReadyCheckPanelProps = {
  battleId: string;
  participants: ReadyParticipant[];
};

export function ReadyCheckPanel({
  battleId,
  participants,
}: ReadyCheckPanelProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserReady = participants.some(
    (participant) => participant.isCurrentUser && participant.isReady,
  );
  const readyCount = useMemo(
    () => participants.filter((participant) => participant.isReady).length,
    [participants],
  );
  useEffect(() => {
    const intervalId = window.setInterval(() => router.refresh(), 3000);

    return () => window.clearInterval(intervalId);
  }, [router]);

  async function markReady() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/battles/${battleId}/ready`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Could not mark ready.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not mark ready.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const readyPercent =
    participants.length > 0 ? (readyCount / participants.length) * 100 : 0;
  return (
    <div className="space-y-5" data-testid="ready-check-panel">
      <div className="bb-graffiti-texture border border-violet-300/20 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.16),transparent_45%),rgba(0,0,0,0.28)] p-5 text-center shadow-[0_0_34px_rgba(168,85,247,0.1)]">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <div>
            <p className="bb-tag-label text-violet-100">Lock in</p>
            <p className="mt-2 text-sm text-zinc-400">
              Confirm before the timer expires.
            </p>
          </div>
          <div className="w-full max-w-xs rounded-xl border border-white/10 bg-black/30 px-5 py-4">
            <p className="font-mono text-3xl font-black text-violet-100">
              {readyCount}/{participants.length}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
              Ready
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-100 transition-all"
              style={{ width: `${readyPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className={cn(
              "min-w-0 rounded-xl border p-4 transition",
              participant.isReady
                ? "border-violet-300/30 bg-violet-300/10"
                : participant.isCurrentUser
                  ? "border-fuchsia-300/35 bg-fuchsia-300/10 shadow-[0_0_32px_rgba(217,70,239,0.12)]"
                : "border-white/10 bg-black/25",
            )}
          >
            <div className="flex min-w-0 flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-sm font-black uppercase text-white">
                {participant.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={participant.avatarUrl}
                    alt=""
                    className="size-full object-cover object-center"
                  />
                ) : (
                  participant.username.slice(0, 2)
                )}
              </span>
              <div className="min-w-0 max-w-full">
                <p className="flex min-w-0 max-w-full items-center justify-center gap-1 font-semibold text-white">
                    <span className="min-w-0 truncate" title={participant.username}>
                      {participant.username}
                    </span>
                  {participant.isCurrentUser ? (
                    <span className="shrink-0 text-xs text-fuchsia-200">YOU</span>
                  ) : null}
                </p>
                <p className="text-xs text-zinc-500">
                  {participant.isReady ? "Ready" : "Not ready"}
                </p>
              </div>
              {participant.isReady ? (
                <CheckIcon className="size-5 text-violet-200" />
              ) : (
                <UsersIcon className="size-5 text-zinc-500" />
              )}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <div className="flex justify-center">
        <GameButton
          type="button"
          disabled={currentUserReady || isSubmitting}
          onClick={markReady}
          className="h-14 w-full text-lg sm:w-auto sm:min-w-56"
        >
          {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {currentUserReady ? "Ready" : "Ready up"}
        </GameButton>
      </div>
    </div>
  );
}
