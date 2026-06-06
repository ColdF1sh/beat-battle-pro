"use client";

import { useCallback, useEffect, useState } from "react";

const VOLUME_STORAGE_KEY = "beat-battle-volume";
const MUTED_STORAGE_KEY = "beat-battle-muted";
const PREVIOUS_VOLUME_STORAGE_KEY = "beat-battle-previous-volume";
const DEFAULT_VOLUME = 80;
const audioSettingsEventName = "beat-battle-audio-settings-change";

function clampVolume(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function readVolume() {
  if (typeof window === "undefined") {
    return DEFAULT_VOLUME;
  }

  const storedValue = window.localStorage.getItem(VOLUME_STORAGE_KEY);

  return storedValue === null ? DEFAULT_VOLUME : clampVolume(Number(storedValue));
}

function readMuted() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(MUTED_STORAGE_KEY) === "true";
}

function emitAudioSettingsChange() {
  window.dispatchEvent(new Event(audioSettingsEventName));
}

export function useAudioSettings() {
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [isMuted, setMutedState] = useState(false);

  useEffect(() => {
    function syncFromStorage() {
      setVolumeState(readVolume());
      setMutedState(readMuted());
    }

    syncFromStorage();

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(audioSettingsEventName, syncFromStorage);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(audioSettingsEventName, syncFromStorage);
    };
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const clampedVolume = clampVolume(nextVolume);

    setVolumeState(clampedVolume);
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clampedVolume));
    if (clampedVolume > 0) {
      setMutedState(false);
      window.localStorage.setItem(MUTED_STORAGE_KEY, "false");
      window.localStorage.setItem(
        PREVIOUS_VOLUME_STORAGE_KEY,
        String(clampedVolume),
      );
    }
    emitAudioSettingsChange();
  }, []);

  const setMuted = useCallback((nextMuted: boolean) => {
    if (nextMuted) {
      const currentVolume = readVolume();
      if (currentVolume > 0) {
        window.localStorage.setItem(
          PREVIOUS_VOLUME_STORAGE_KEY,
          String(currentVolume),
        );
      }
    } else {
      const previousVolume = clampVolume(
        Number(window.localStorage.getItem(PREVIOUS_VOLUME_STORAGE_KEY)),
      );
      if (readVolume() === 0) {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, String(previousVolume));
        setVolumeState(previousVolume);
      }
    }

    setMutedState(nextMuted);
    window.localStorage.setItem(MUTED_STORAGE_KEY, String(nextMuted));
    emitAudioSettingsChange();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!readMuted());
  }, [setMuted]);

  return {
    volume,
    setVolume,
    isMuted,
    setMuted,
    toggleMute,
    effectiveVolume: isMuted ? 0 : volume / 100,
  };
}
