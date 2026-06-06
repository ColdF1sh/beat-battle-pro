"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";

import { Button } from "@/components/ui/button";
import { useAudioSettings } from "@/hooks/use-audio-settings";

type SubmissionAudioPlayerProps = {
  fileUrl?: string | null;
  fileName: string;
  enableHoverPreview?: boolean;
  hoverPreviewMode?: "pause" | "restart";
  autoPlayWhenReady?: boolean;
  lockedControls?: boolean;
  compact?: boolean;
  showFileName?: boolean;
  onEnded?: () => void;
  onAutoplayBlocked?: () => void;
  onPlaybackStarted?: () => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export function SubmissionAudioPlayer({
  fileUrl,
  fileName,
  enableHoverPreview = true,
  hoverPreviewMode = "pause",
  autoPlayWhenReady = false,
  lockedControls = false,
  compact = false,
  showFileName = true,
  onEnded,
  onAutoplayBlocked,
  onPlaybackStarted,
}: SubmissionAudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playerId = useId();
  const playerIdRef = useRef(playerId);
  const hoverPreviewActiveRef = useRef(false);
  const manualPlaybackRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  const onPlaybackStartedRef = useRef(onPlaybackStarted);
  const { effectiveVolume } = useAudioSettings();
  const effectiveVolumeRef = useRef(effectiveVolume);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onAutoplayBlockedRef.current = onAutoplayBlocked;
  }, [onAutoplayBlocked]);

  useEffect(() => {
    onPlaybackStartedRef.current = onPlaybackStarted;
  }, [onPlaybackStarted]);

  useEffect(() => {
    let isMounted = true;

    async function createWaveform() {
      if (!containerRef.current) {
        return;
      }

      setIsReady(false);
      setHasError(false);
      setErrorMessage(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      if (!fileUrl || !fileUrl.trim()) {
        setHasError(true);
        setErrorMessage("Audio file is unavailable.");
        return;
      }

      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;

        if (!isMounted || !containerRef.current) {
          return;
        }

        wavesurferRef.current?.destroy();
        containerRef.current.innerHTML = "";
        const wavesurfer = WaveSurfer.create({
          container: containerRef.current,
          waveColor: "rgba(168, 85, 247, 0.55)",
          progressColor: "rgb(34, 211, 238)",
          cursorColor: "rgb(244, 114, 182)",
          height: compact ? 52 : 88,
          barWidth: 2,
          barGap: 2,
          barRadius: 2,
          normalize: true,
          interact: !lockedControls,
        });

        wavesurferRef.current = wavesurfer;
        wavesurfer.setVolume(effectiveVolumeRef.current);

        wavesurfer.on("ready", () => {
          setIsReady(true);
          setDuration(wavesurfer.getDuration());
        });
        wavesurfer.on("audioprocess", (time) => setCurrentTime(time));
        wavesurfer.on("timeupdate", (time) => setCurrentTime(time));
        wavesurfer.on("play", () => {
          setIsPlaying(true);
          onPlaybackStartedRef.current?.();
        });
        wavesurfer.on("pause", () => {
          setIsPlaying(false);
          hoverPreviewActiveRef.current = false;
        });
        wavesurfer.on("finish", () => {
          setIsPlaying(false);
          setCurrentTime(wavesurfer.getDuration());
          onEndedRef.current?.();
        });
        wavesurfer.on("error", () => {
          setHasError(true);
          setErrorMessage("Waveform unavailable. Using audio fallback.");
          setIsReady(false);
        });
        void Promise.resolve(wavesurfer.load(fileUrl)).catch(() => {
          if (!isMounted) {
            return;
          }

          setHasError(true);
          setErrorMessage("Waveform unavailable. Using audio fallback.");
          setIsReady(false);
        });
      } catch (error) {
        console.warn("Could not create audio waveform", {
          fileUrl,
          error,
        });
        setHasError(true);
        setErrorMessage("Waveform unavailable. Using audio fallback.");
      }
    }

    createWaveform();

    const fallbackAudio = fallbackAudioRef.current;

    return () => {
      isMounted = false;
      wavesurferRef.current?.pause();
      wavesurferRef.current?.destroy();
      wavesurferRef.current = null;
      fallbackAudio?.pause();
      if (fallbackAudio) {
        fallbackAudio.currentTime = 0;
      }
    };
  }, [compact, fileUrl, lockedControls]);

  useEffect(() => {
    function handlePreviewStarted(event: Event) {
      const detail = (event as CustomEvent<{ playerId?: string }>).detail;

      if (detail?.playerId === playerIdRef.current) {
        return;
      }

      if (hoverPreviewActiveRef.current) {
        wavesurferRef.current?.pause();
        if (hoverPreviewMode === "restart") {
          wavesurferRef.current?.seekTo(0);
          setCurrentTime(0);
        }
        fallbackAudioRef.current?.pause();
        if (fallbackAudioRef.current && hoverPreviewMode === "restart") {
          fallbackAudioRef.current.currentTime = 0;
        }
        hoverPreviewActiveRef.current = false;
      }
    }

    window.addEventListener(
      "beat-battle-audio-preview-started",
      handlePreviewStarted,
    );

    return () => {
      window.removeEventListener(
        "beat-battle-audio-preview-started",
        handlePreviewStarted,
      );
    };
  }, [hoverPreviewMode]);

  useEffect(() => {
    effectiveVolumeRef.current = effectiveVolume;
    wavesurferRef.current?.setVolume(effectiveVolume);

    if (fallbackAudioRef.current) {
      fallbackAudioRef.current.volume = effectiveVolume;
    }
  }, [effectiveVolume]);

  useEffect(() => {
    if (!autoPlayWhenReady || !isReady || !wavesurferRef.current) {
      return;
    }

    void wavesurferRef.current.play().catch(() => {
      onAutoplayBlockedRef.current?.();
    });
  }, [autoPlayWhenReady, fileUrl, isReady]);

  function togglePlayback() {
    if (!wavesurferRef.current || !isReady) {
      return;
    }

    manualPlaybackRef.current = !isPlaying;
    hoverPreviewActiveRef.current = false;
    void wavesurferRef.current.playPause();
  }

  function canHoverPreview() {
    return (
      enableHoverPreview &&
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    );
  }

  function startHoverPreview() {
    if (!canHoverPreview() || manualPlaybackRef.current) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("beat-battle-audio-preview-started", {
        detail: {
          playerId: playerIdRef.current,
        },
      }),
    );

    if (hasError) {
      if (!fallbackAudioRef.current || lockedControls) {
        return;
      }

      fallbackAudioRef.current.volume = effectiveVolumeRef.current;
      if (hoverPreviewMode === "restart") {
        fallbackAudioRef.current.currentTime = 0;
      }
      hoverPreviewActiveRef.current = true;
      void fallbackAudioRef.current.play().catch(() => {
        hoverPreviewActiveRef.current = false;
      });
      return;
    }

    if (
      lockedControls ||
      !wavesurferRef.current ||
      !isReady ||
      wavesurferRef.current.isPlaying()
    ) {
      return;
    }

    if (hoverPreviewMode === "restart") {
      wavesurferRef.current.seekTo(0);
      setCurrentTime(0);
    }
    hoverPreviewActiveRef.current = true;
    void wavesurferRef.current.play().catch(() => {
      hoverPreviewActiveRef.current = false;
    });
  }

  function stopHoverPreview() {
    if (!hoverPreviewActiveRef.current) {
      return;
    }

    wavesurferRef.current?.pause();
    if (hoverPreviewMode === "restart") {
      wavesurferRef.current?.seekTo(0);
      setCurrentTime(0);
    }
    fallbackAudioRef.current?.pause();
    if (fallbackAudioRef.current && hoverPreviewMode === "restart") {
      fallbackAudioRef.current.currentTime = 0;
    }
    hoverPreviewActiveRef.current = false;
  }

  if (hasError) {
    return (
      <div
        className={
          compact
            ? "rounded-lg border border-white/10 bg-black/25 p-2.5"
            : "rounded-lg border border-white/10 bg-black/25 p-3"
        }
        data-testid="submission-audio-player"
        onMouseEnter={lockedControls ? undefined : startHoverPreview}
        onMouseLeave={lockedControls ? undefined : stopHoverPreview}
      >
        {showFileName ? (
          <p className="mb-2 text-xs text-zinc-500">{fileName}</p>
        ) : null}
        {errorMessage ? (
          <p className="mb-2 rounded-md border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[11px] font-semibold text-violet-100">
            {errorMessage}
          </p>
        ) : null}
        {fileUrl ? (
          <audio
            ref={fallbackAudioRef}
            controls={!lockedControls}
            autoPlay={autoPlayWhenReady}
            preload="none"
            src={fileUrl}
            className={lockedControls ? "sr-only" : "h-9 w-full"}
            aria-label={fileName}
            onError={() => {
              setErrorMessage("Audio could not be loaded.");
              setIsReady(false);
            }}
            onEnded={() => onEndedRef.current?.()}
            onPlay={() => {
              onPlaybackStartedRef.current?.();
              manualPlaybackRef.current = !hoverPreviewActiveRef.current;
            }}
            onPause={() => {
              if (!hoverPreviewActiveRef.current) {
                manualPlaybackRef.current = false;
              }
            }}
          >
            Preview is not available in this browser.
          </audio>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-white/10 bg-black/25 p-2.5"
          : "rounded-lg border border-white/10 bg-black/25 p-3"
      }
      data-testid="submission-audio-player"
      onMouseEnter={lockedControls ? undefined : startHoverPreview}
      onMouseLeave={lockedControls ? undefined : stopHoverPreview}
    >
      <div className={showFileName ? "mb-3 flex items-center justify-between gap-3" : "mb-1.5 flex justify-end"}>
        {showFileName ? (
          <p className="min-w-0 truncate text-sm font-medium text-white">
            {fileName}
          </p>
        ) : null}
        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div
        ref={containerRef}
        className={
          compact
            ? "min-h-[52px] overflow-hidden rounded-md bg-black/20"
            : "min-h-[88px] overflow-hidden rounded-md bg-black/20"
        }
      />

      {!isReady ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-teal-300" />
        </div>
      ) : null}

      {lockedControls ? (
        <div className="mt-3 flex justify-end border border-white/10 bg-black/25 px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            {isPlaying ? "Playing" : isReady ? "Queued" : "Loading"}
          </span>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isReady}
          onClick={togglePlayback}
          className={compact ? "mt-2 h-8 border-white/10 bg-white/[0.04] px-2 text-xs text-zinc-100 hover:bg-white/10" : "mt-3 border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/10"}
        >
          {isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {isPlaying ? "Pause" : "Play"}
        </Button>
      )}
    </div>
  );
}
