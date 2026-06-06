"use client";

import type { BattleStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type BattleTimerProps = {
  status: BattleStatus;
  startedAt: Date | string | null;
  endsAt: Date | string | null;
  durationMinutes: number;
  readyEndsAt?: Date | string | null;
  submissionEndsAt?: Date | string | null;
  votingEndsAt?: Date | string | null;
  compact?: boolean;
};

function toDate(value: Date | string | null) {
  return value ? new Date(value) : null;
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function BattleTimer({
  status,
  startedAt,
  endsAt,
  durationMinutes,
  readyEndsAt,
  submissionEndsAt,
  votingEndsAt,
  compact = false,
}: BattleTimerProps) {
  const startedDate = useMemo(() => toDate(startedAt), [startedAt]);
  const endsDate = useMemo(() => toDate(endsAt), [endsAt]);
  const submissionEndsDate = useMemo(
    () => toDate(submissionEndsAt ?? null),
    [submissionEndsAt],
  );
  const votingEndsDate = useMemo(
    () => toDate(votingEndsAt ?? null),
    [votingEndsAt],
  );
  const readyEndsDate = useMemo(
    () => toDate(readyEndsAt ?? null),
    [readyEndsAt],
  );
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const targetDate =
      status === "READY"
        ? readyEndsDate
        : status === "SUBMISSION"
        ? submissionEndsDate
        : status === "VOTING"
          ? votingEndsDate
          : endsDate;

    if (
      (status !== "READY" &&
        status !== "ACTIVE" &&
        status !== "SUBMISSION" &&
        status !== "VOTING") ||
      !targetDate
    ) {
      return;
    }

    function updateRemaining() {
      setRemainingMs(Math.max(0, targetDate!.getTime() - Date.now()));
    }

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => window.clearInterval(intervalId);
  }, [endsDate, status, submissionEndsDate, votingEndsDate, readyEndsDate]);

  if (status === "WAITING") {
    return (
      <TimerShell value={`${durationMinutes} min`} compact={compact}>
        Starts at battle launch.
      </TimerShell>
    );
  }

  if (status === "READY") {
    return (
      <TimerShell
        value={remainingMs === null ? "00:15" : formatRemaining(remainingMs)}
        compact={compact}
      >
        Ready check.
      </TimerShell>
    );
  }

  if (status === "DRAFTING") {
    return (
      <TimerShell value="Drafting" compact={compact}>
        Draft the rules.
      </TimerShell>
    );
  }

  if (status === "ACTIVE" && startedDate && endsDate) {
    return (
      <TimerShell
        value={remainingMs === null ? "--:--" : formatRemaining(remainingMs)}
        compact={compact}
      >
        Time left.
      </TimerShell>
    );
  }

  if (status === "ACTIVE") {
    return (
      <TimerShell value={`${durationMinutes} min`} compact={compact}>
        Timer unavailable.
      </TimerShell>
    );
  }

  if (status === "SUBMISSION") {
    return (
      <TimerShell
        value={remainingMs === null ? "01:00" : formatRemaining(remainingMs)}
        compact={compact}
      >
        Submission window.
      </TimerShell>
    );
  }

  if (status === "VOTING") {
    if (!votingEndsDate) {
      return (
        <TimerShell value="Listening" compact={compact}>
          Voting unlocks after playback.
        </TimerShell>
      );
    }

    return (
      <TimerShell
        value={remainingMs === null ? "00:25" : formatRemaining(remainingMs)}
        compact={compact}
      >
        Voting window.
      </TimerShell>
    );
  }

  if (status === "FINISHED") {
    return <TimerShell value="Finished" compact={compact}>Results locked.</TimerShell>;
  }

  return <TimerShell value="Cancelled" compact={compact}>Room closed.</TimerShell>;
}

function TimerShell({
  value,
  children,
  compact = false,
}: {
  value: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "min-w-0 text-left" : "rounded-lg border border-white/10 bg-black/25 p-5 text-center"}>
      <p className={compact ? "max-w-full font-mono text-[clamp(0.8rem,1.65vw,1.05rem)] font-black leading-tight tracking-wide text-white" : "font-mono text-4xl font-semibold tracking-wider text-white"}>
        {value}
      </p>
      <p className={compact ? "mt-1 max-w-full text-[11px] leading-snug text-zinc-500" : "mt-2 text-sm text-zinc-500"}>{children}</p>
    </div>
  );
}
