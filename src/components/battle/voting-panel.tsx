"use client";

import { CheckCircle2Icon, GaugeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SubmissionAudioPlayer } from "@/components/audio/submission-audio-player";
import { gameButtonClassName } from "@/components/ui/game-button";
import { cn } from "@/lib/utils";

type Submission = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string | Date;
};

type VotingParticipant = {
  id: string;
  userId: string;
  username: string;
  joinedAt?: string;
  submission: Submission | null;
};

type ExistingVote = Array<{
  participantId: string;
  score: number;
}> | null;

type VotingPanelProps = {
  battleId: string;
  currentUserId: string;
  participants: VotingParticipant[];
  existingVote?: ExistingVote;
  canVote: boolean;
  listeningCompleted: boolean;
};

type ListeningState =
  | "LISTENING_NOT_STARTED"
  | "LISTENING_PLAYING"
  | "LISTENING_COMPLETING"
  | "VOTING_READY"
  | "VOTING_SUBMITTED";

function getScoreLabel(score: number) {
  if (score === 1) {
    return "terrible";
  }

  if (score === 10) {
    return "insane";
  }

  return "score";
}

function clampScore(score: number) {
  return Math.max(1, Math.min(10, score));
}

function RatingSlider({
  value,
  disabled,
  onChange,
  participantId,
}: {
  value: number;
  disabled: boolean;
  onChange: (score: number) => void;
  participantId: string;
}) {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const displayValue = previewValue ?? value;
  const fillPercent = value > 0 ? value * 10 : 0;
  const previewPercent = displayValue > 0 ? displayValue * 10 : 0;
  const markerPercent = value > 0 ? `${value * 10}%` : "0%";

  const getScoreFromPointer = useCallback((clientX: number) => {
    const rect = sliderRef.current?.getBoundingClientRect();

    if (!rect || rect.width === 0) {
      return 1;
    }

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampScore(Math.ceil(ratio * 10));
  }, []);

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    onChange(getScoreFromPointer(event.clientX));
  }

  function previewFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    setPreviewValue(getScoreFromPointer(event.clientX));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    const currentValue = value || 1;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(clampScore(currentValue - 1));
    }

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(clampScore(currentValue + 1));
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChange(1);
    }

    if (event.key === "End") {
      event.preventDefault();
      onChange(10);
    }
  }

  return (
    <div
      className={cn(
        "mt-4 rounded-xl border border-white/10 bg-black/30 p-3",
        disabled && "opacity-55",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
          Weak
        </span>
        <span className="font-mono text-xl font-black text-white drop-shadow-[0_0_12px_rgba(217,70,239,0.35)]">
          {displayValue ? `${displayValue}/10` : "--/10"}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-100">
          Insane
        </span>
      </div>
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Track rating"
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={value || 1}
        data-testid={`vote-rating-slider-${participantId}`}
        onPointerDown={(event) => {
          updateFromPointer(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          previewFromPointer(event);

          if (event.buttons === 1) {
            updateFromPointer(event);
          }
        }}
        onPointerLeave={() => setPreviewValue(null)}
        onPointerUp={(event) => {
          updateFromPointer(event);
          setPreviewValue(null);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "group relative h-12 cursor-pointer overflow-hidden rounded-full border border-violet-200/15 bg-[linear-gradient(90deg,rgba(24,12,36,0.98),rgba(47,22,60,0.92))] outline-none shadow-inner shadow-black/40 transition focus-visible:border-fuchsia-200/60 focus-visible:ring-2 focus-visible:ring-fuchsia-300/30",
          disabled && "pointer-events-none cursor-not-allowed",
        )}
      >
        <div className="absolute inset-1 rounded-full bg-black/35" />
        <div
          className="absolute inset-y-1 left-1 rounded-full bg-[linear-gradient(90deg,rgba(76,29,149,0.8),rgba(168,85,247,0.88),rgba(217,70,239,0.92),rgba(233,213,255,0.95))] shadow-[0_0_28px_rgba(217,70,239,0.26)] transition-[width] duration-150"
          style={{ width: value > 0 ? `calc(${fillPercent}% - 0.5rem)` : "0" }}
        />
        {previewValue ? (
          <div
            className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-white/12 transition-[width] duration-75"
            style={{ width: `calc(${previewPercent}% - 0.5rem)` }}
          />
        ) : null}
        {value > 0 ? (
          <span
            className="pointer-events-none absolute top-1/2 z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/70 text-fuchsia-100 shadow-[0_0_24px_rgba(217,70,239,0.42)] transition-[left] duration-150"
            style={{ left: `calc(${markerPercent} - 1rem)` }}
          >
            <CheckCircle2Icon className="size-4" />
          </span>
        ) : null}
        <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-white/10" />
      </div>
    </div>
  );
}

const LISTENING_TRACK_MAX_MS = 50_000;
const REACTION_PREFIX = "__reaction__:";
const reactionEmojis = [
  "\uD83D\uDD25",
  "\uD83D\uDC80",
  "\uD83C\uDFA7",
  "\uD83D\uDE80",
  "\uD83D\uDE2D",
  "\uD83C\uDFC6",
  "\uD83D\uDC4D",
  "\uD83D\uDC4E",
];

type ReactionMessage = {
  id: string;
  content: string;
  createdAt: string;
  user: {
    username: string;
    avatarUrl: string | null;
  };
};

type FloatingReaction = {
  id: string;
  emoji: string;
  left: number;
};

function ListeningReactions({ battleId }: { battleId: string }) {
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>(
    [],
  );
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedInitialMessagesRef = useRef(false);
  const localReactionIdRef = useRef(0);

  const showReaction = useCallback((id: string, emoji: string) => {
    setFloatingReactions((current) => [
      ...current,
      {
        id,
        emoji,
        left: 12 + Math.random() * 76,
      },
    ]);

    window.setTimeout(() => {
      setFloatingReactions((current) =>
        current.filter((reaction) => reaction.id !== id),
      );
    }, 1400);
  }, []);

  const loadReactions = useCallback(async () => {
    try {
      const response = await fetch(`/api/battles/${battleId}/messages`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { messages: ReactionMessage[] };
      const reactions = data.messages.filter((message) =>
        message.content.startsWith(REACTION_PREFIX),
      );

      for (const reaction of reactions) {
        if (knownMessageIdsRef.current.has(reaction.id)) {
          continue;
        }

        knownMessageIdsRef.current.add(reaction.id);

        if (hasLoadedInitialMessagesRef.current) {
          showReaction(reaction.id, reaction.content.slice(REACTION_PREFIX.length));
        }
      }

      hasLoadedInitialMessagesRef.current = true;
    } catch {
      // Reactions are best-effort.
    }
  }, [battleId, showReaction]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReactions();
    }, 0);
    const intervalId = window.setInterval(loadReactions, 1500);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [loadReactions]);

  async function sendReaction(emoji: string) {
    localReactionIdRef.current += 1;
    const localId = `local-${localReactionIdRef.current}`;
    showReaction(localId, emoji);

    try {
      await fetch(`/api/battles/${battleId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: `${REACTION_PREFIX}${emoji}` }),
      });
    } catch {
      // Reactions are best-effort.
    }
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 h-36 overflow-visible">
        {floatingReactions.map((reaction) => (
          <span
            key={reaction.id}
            className="bb-reaction-pop absolute bottom-0 text-4xl"
            style={{ left: `${reaction.left}%` }}
          >
            {reaction.emoji}
          </span>
        ))}
      </div>
      <div className="relative z-10 mt-3 flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-2 border border-white/10 bg-black/25 px-3 py-2">
        {reactionEmojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => void sendReaction(emoji)}
            className="flex size-9 items-center justify-center border border-violet-300/20 bg-violet-400/10 text-lg transition hover:-translate-y-0.5 hover:bg-violet-400/20"
          >
            {emoji}
          </button>
        ))}
        </div>
      </div>
    </>
  );
}

export function VotingPanel({
  battleId,
  currentUserId,
  participants,
  existingVote = null,
  canVote,
  listeningCompleted,
}: VotingPanelProps) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (existingVote ?? []).map((vote) => [vote.participantId, vote.score]),
    ),
  );
  const [hasSubmittedVote, setHasSubmittedVote] = useState(Boolean(existingVote));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    existingVote ? "Your vote has been submitted." : null,
  );
  const [currentListenIndex, setCurrentListenIndex] = useState(0);
  const [listeningState, setListeningState] = useState<ListeningState>(
    existingVote
      ? "VOTING_SUBMITTED"
      : listeningCompleted
        ? "VOTING_READY"
        : "LISTENING_PLAYING",
  );
  const [isCompletingListening, setIsCompletingListening] = useState(false);
  const [hasStartedListening, setHasStartedListening] = useState(true);
  const [isFinalizingListening, setIsFinalizingListening] = useState(false);
  const advancingTrackRef = useRef(false);
  const isCompletingListeningRef = useRef(false);
  const hasCalledListeningCompleteRef = useRef(false);
  const hasCompletedListeningRef = useRef(
    listeningCompleted || Boolean(existingVote),
  );
  const activeTrackIdRef = useRef<string | null>(null);
  const currentTrackIndexRef = useRef(0);
  const completedTrackIdsRef = useRef<Set<string>>(new Set());
  const maxDurationTimerRef = useRef<number | null>(null);
  const hasRefreshedAfterListeningRef = useRef(false);

  const listeningParticipants = useMemo(
    () =>
      participants
        .filter((participant) => participant.submission)
        .sort((firstParticipant, secondParticipant) => {
          const firstJoinedAt = firstParticipant.joinedAt
            ? new Date(firstParticipant.joinedAt).getTime()
            : 0;
          const secondJoinedAt = secondParticipant.joinedAt
            ? new Date(secondParticipant.joinedAt).getTime()
            : 0;

          if (firstJoinedAt !== secondJoinedAt) {
            return firstJoinedAt - secondJoinedAt;
          }

          const firstSubmissionAt = firstParticipant.submission?.createdAt
            ? new Date(firstParticipant.submission.createdAt).getTime()
            : 0;
          const secondSubmissionAt = secondParticipant.submission?.createdAt
            ? new Date(secondParticipant.submission.createdAt).getTime()
            : 0;

          if (firstSubmissionAt !== secondSubmissionAt) {
            return firstSubmissionAt - secondSubmissionAt;
          }

          return firstParticipant.id.localeCompare(secondParticipant.id);
        }),
    [participants],
  );
  const trackLabelByParticipantId = useMemo(
    () =>
      new Map(
        listeningParticipants.map((participant, index) => [
          participant.id,
          `Track ${index + 1}`,
        ]),
      ),
    [listeningParticipants],
  );
  const eligibleParticipants = useMemo(
    () =>
      listeningParticipants.filter(
        (participant) =>
          participant.userId !== currentUserId && participant.submission,
      ),
    [currentUserId, listeningParticipants],
  );
  const hasCompletedListening =
    listeningState === "VOTING_READY" || listeningState === "VOTING_SUBMITTED";
  const isLocked = hasSubmittedVote || !canVote || !hasCompletedListening;
  const allScoresSelected = eligibleParticipants.every(
    (participant) => scores[participant.id] >= 1 && scores[participant.id] <= 10,
  );
  const currentListeningParticipant =
    listeningParticipants[currentListenIndex] ?? listeningParticipants[0];
  const currentListeningSubmission =
    currentListeningParticipant?.submission ?? null;

  const clearMaxTrackTimer = useCallback(() => {
    if (maxDurationTimerRef.current) {
      window.clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    hasCompletedListeningRef.current = hasCompletedListening;
  }, [hasCompletedListening]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || hasCompletedListening) {
      return;
    }

    console.debug(
      "Listening track order:",
      listeningParticipants.map((participant, index) => ({
        index: index + 1,
        submissionId: participant.submission?.id,
      })),
    );
  }, [hasCompletedListening, listeningParticipants]);

  function selectScore(participantId: string, score: number) {
    if (isLocked || isSubmitting) {
      return;
    }

    setError(null);
    setScores((current) => ({
      ...current,
      [participantId]: score,
    }));
  }

  async function submitVote() {
    if (isLocked || isSubmitting) {
      return;
    }

    if (!allScoresSelected) {
      setError("Score every eligible submission before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/battles/${battleId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scores: eligibleParticipants.map((participant) => ({
            participantId: participant.id,
            score: scores[participant.id],
          })),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { status: "success" }
        | { error?: string }
        | null;

      if (!response.ok || !data || !("status" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Could not submit vote. Please try again.",
        );
        return;
      }

      setHasSubmittedVote(true);
      setListeningState("VOTING_SUBMITTED");
      setSuccessMessage("Your vote has been submitted.");
      router.refresh();
    } catch {
      setError("Could not submit vote. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const completeListening = useCallback(async () => {
    if (
      isCompletingListeningRef.current ||
      hasCalledListeningCompleteRef.current ||
      hasCompletedListeningRef.current
    ) {
      return;
    }

    isCompletingListeningRef.current = true;
    hasCalledListeningCompleteRef.current = true;
    clearMaxTrackTimer();
    setIsCompletingListening(true);
    setListeningState("LISTENING_COMPLETING");
    setError(null);

    try {
      const response = await fetch(
        `/api/battles/${battleId}/listening-complete`,
        {
          method: "POST",
        },
      );
      const data = (await response.json().catch(() => null)) as
        | {
            status: "success";
            alreadyCompleted?: boolean;
            votingUnlocked?: boolean;
          }
        | { error?: string }
        | null;

      if (!response.ok || !data || !("status" in data)) {
        hasCalledListeningCompleteRef.current = false;
        setListeningState("LISTENING_PLAYING");
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Could not unlock voting.",
        );
        return;
      }

      hasCompletedListeningRef.current = true;
      setListeningState("VOTING_READY");
      setSuccessMessage(null);
      if (!hasRefreshedAfterListeningRef.current) {
        hasRefreshedAfterListeningRef.current = true;
        router.refresh();
      }
    } catch {
      hasCalledListeningCompleteRef.current = false;
      setListeningState("LISTENING_PLAYING");
      setError("Could not unlock voting.");
    } finally {
      isCompletingListeningRef.current = false;
      setIsCompletingListening(false);
      setIsFinalizingListening(false);
    }
  }, [battleId, clearMaxTrackTimer, router]);

  const advanceListeningTrack = useCallback(
    (trackId: string, reason: "ended" | "max-duration") => {
      if (
        advancingTrackRef.current ||
        activeTrackIdRef.current !== trackId ||
        completedTrackIdsRef.current.has(trackId)
      ) {
        return;
      }

      advancingTrackRef.current = true;
      completedTrackIdsRef.current.add(trackId);
      clearMaxTrackTimer();

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          reason === "ended"
            ? "Track ended naturally"
            : "Track max duration reached: 50s",
          { trackId },
        );
      }

      const activeIndex =
        listeningParticipants[currentTrackIndexRef.current]?.submission?.id ===
        trackId
          ? currentTrackIndexRef.current
          : listeningParticipants.findIndex(
              (participant) => participant.submission?.id === trackId,
            );
      const safeIndex =
        activeIndex >= 0 ? activeIndex : currentTrackIndexRef.current;
      const isLastTrack =
        safeIndex >= Math.max(0, listeningParticipants.length - 1);

      if (isLastTrack) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("Listening completed");
        }

        activeTrackIdRef.current = null;
        setCurrentListenIndex(safeIndex);
        setIsFinalizingListening(true);
        void completeListening();
      } else {
        if (process.env.NODE_ENV !== "production") {
          console.debug("Advancing to next track", {
            from: safeIndex + 1,
            to: safeIndex + 2,
          });
        }

        currentTrackIndexRef.current = safeIndex + 1;
        setCurrentListenIndex(safeIndex + 1);
      }

      window.setTimeout(() => {
        advancingTrackRef.current = false;
      }, 150);
    },
    [clearMaxTrackTimer, completeListening, listeningParticipants],
  );

  const startListeningTrack = useCallback(
    (trackId: string) => {
      if (
        hasCompletedListening ||
        completedTrackIdsRef.current.has(trackId) ||
        activeTrackIdRef.current !== trackId ||
        maxDurationTimerRef.current !== null
      ) {
        return;
      }

      const trackIndex = listeningParticipants.findIndex(
        (participant) => participant.submission?.id === trackId,
      );

      if (process.env.NODE_ENV !== "production") {
        console.debug(`Track started: ${trackIndex + 1}`, {
          trackId,
          total: listeningParticipants.length,
        });
        console.debug("Max duration timer started", {
          trackId,
          milliseconds: LISTENING_TRACK_MAX_MS,
        });
      }

      setListeningState("LISTENING_PLAYING");
      maxDurationTimerRef.current = window.setTimeout(() => {
        if (process.env.NODE_ENV !== "production") {
          console.debug("50s max reached", { trackId });
        }
        advanceListeningTrack(trackId, "max-duration");
      }, LISTENING_TRACK_MAX_MS);
    },
    [advanceListeningTrack, hasCompletedListening, listeningParticipants],
  );

  useEffect(() => {
    if (
      hasCompletedListening ||
      isFinalizingListening ||
      !hasStartedListening ||
      !currentListeningSubmission
    ) {
      clearMaxTrackTimer();
      return;
    }

    activeTrackIdRef.current = currentListeningSubmission.id;
    currentTrackIndexRef.current = currentListenIndex;
    advancingTrackRef.current = false;
    clearMaxTrackTimer();

    return clearMaxTrackTimer;
  }, [
    clearMaxTrackTimer,
    currentListeningSubmission,
    currentListenIndex,
    hasCompletedListening,
    hasStartedListening,
    isFinalizingListening,
  ]);

  if (listeningParticipants.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
        No submissions uploaded yet.
      </p>
    );
  }

  if (!hasCompletedListening) {
    const currentParticipant =
      listeningParticipants[currentListenIndex] ?? listeningParticipants[0];
    const currentSubmission = currentParticipant?.submission ?? null;
    const isLastTrack =
      currentListenIndex >= Math.max(0, listeningParticipants.length - 1);

    return (
      <div className="space-y-4" data-testid="voting-listening-panel">
        <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-5 shadow-[0_0_34px_rgba(168,85,247,0.12)]">
          <p className="bb-tag-label text-xs text-violet-100">
            Listen first, then vote
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-3xl font-black uppercase text-white">
                {trackLabelByParticipantId.get(currentParticipant?.id ?? "") ??
                  "Track queue"}
              </h4>
              <p className="mt-1 text-sm text-zinc-400">
                Track{" "}
                {Math.min(currentListenIndex + 1, listeningParticipants.length)}{" "}
                of {listeningParticipants.length}
              </p>
            </div>
            <span className="w-fit rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300">
              Voting locked
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-300"
              style={{
                width: `${((currentListenIndex + 1) / listeningParticipants.length) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="relative overflow-visible">
          {currentSubmission && !isFinalizingListening ? (
            <SubmissionAudioPlayer
              key={currentSubmission.id}
              fileUrl={currentSubmission.fileUrl}
              fileName={
                trackLabelByParticipantId.get(currentParticipant?.id ?? "") ??
                "Track"
              }
              showFileName={false}
              enableHoverPreview={false}
              autoPlayWhenReady={hasStartedListening}
              lockedControls
              onEnded={() => advanceListeningTrack(currentSubmission.id, "ended")}
              onAutoplayBlocked={() => {
                setHasStartedListening(false);
                setListeningState("LISTENING_NOT_STARTED");
              }}
              onPlaybackStarted={() => startListeningTrack(currentSubmission.id)}
            />
          ) : null}

          <ListeningReactions battleId={battleId} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!hasStartedListening ? (
            <button
              type="button"
              disabled={isCompletingListening}
              onClick={() => {
                setHasStartedListening(true);
                setListeningState("LISTENING_PLAYING");
              }}
              className={gameButtonClassName("primary", "h-11 px-5")}
            >
              Start listening
            </button>
          ) : null}
          {isLastTrack && isCompletingListening ? (
            <span className="rounded-lg border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-100">
              Unlocking voting...
            </span>
          ) : null}
          {isLastTrack &&
          error &&
          listeningState !== "LISTENING_COMPLETING" ? (
            <button
              type="button"
              disabled={isCompletingListening}
              onClick={() => void completeListening()}
              className={gameButtonClassName("secondary", "h-11 px-5")}
            >
              Retry unlock voting
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="voting-panel">
      {successMessage ? (
        <p className="rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-sm text-violet-100">
          {successMessage}
        </p>
      ) : null}

      {!canVote ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
          Voting is not open for this battle.
        </p>
      ) : null}

      {eligibleParticipants.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
          No eligible opponents have submissions to rank.
        </p>
      ) : null}

      <div className="grid gap-3">
        {eligibleParticipants.map((participant) => {
          const selectedScore = scores[participant.id] ?? 0;
          const trackLabel =
            trackLabelByParticipantId.get(participant.id) ?? "Track";

          return (
            <div
              key={participant.id}
              data-testid="voting-participant"
              className="rounded-lg border border-white/10 bg-black/20 p-4"
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-white">
                    {trackLabel}
                  </p>
                </div>
                {selectedScore > 0 ? (
                  <span className="inline-flex w-fit items-center gap-1 rounded-full border border-fuchsia-300/35 bg-fuchsia-400/10 px-3 py-1 text-sm font-black text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.12)]">
                    <CheckCircle2Icon className="size-4" />
                    {selectedScore}/10 {getScoreLabel(selectedScore)}
                  </span>
                ) : null}
              </div>

              {participant.submission ? (
                <SubmissionAudioPlayer
                  fileUrl={participant.submission.fileUrl}
                  fileName={trackLabel}
                  showFileName={false}
                />
              ) : null}

              <RatingSlider
                value={selectedScore}
                disabled={isLocked || isSubmitting}
                participantId={participant.id}
                onChange={(score) => selectScore(participant.id, score)}
              />
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-medium text-white">Your scores</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {eligibleParticipants.map((participant) => {
            const score = scores[participant.id] ?? 0;
            const trackLabel =
              trackLabelByParticipantId.get(participant.id) ?? "Track";

            return (
              <div
                key={participant.id}
                className={cn(
                  "rounded-lg border bg-white/[0.04] p-3",
                  score
                    ? "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100"
                    : "border-white/10",
                )}
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                  {trackLabel}
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-zinc-100">
                  <GaugeIcon className="size-4 text-violet-200" />
                  {score ? `${score}/10` : "No score"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="submit-vote"
        disabled={isLocked || isSubmitting || !allScoresSelected}
        onClick={submitVote}
        className={gameButtonClassName("danger", "min-w-48")}
      >
        {isSubmitting ? "Submitting vote..." : "Submit Vote"}
      </button>
    </div>
  );
}
