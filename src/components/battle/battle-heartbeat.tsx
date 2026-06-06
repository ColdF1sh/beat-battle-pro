"use client";

import { useCallback, useEffect, useRef } from "react";

type BattleHeartbeatProps = {
  battleId: string;
  enabled: boolean;
};

export function BattleHeartbeat({ battleId, enabled }: BattleHeartbeatProps) {
  const inFlightRef = useRef(false);

  const sendHeartbeat = useCallback(async () => {
    if (!enabled || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;

    try {
      await fetch(`/api/battles/${battleId}/heartbeat`, {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      });
    } catch {
      // Heartbeat is best-effort; reconnect grace is handled server-side.
    } finally {
      inFlightRef.current = false;
    }
  }, [battleId, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void sendHeartbeat();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }, 15_000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }

    window.addEventListener("focus", sendHeartbeat);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", sendHeartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, sendHeartbeat]);

  return null;
}
