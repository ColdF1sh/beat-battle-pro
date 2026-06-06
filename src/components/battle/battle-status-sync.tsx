"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type BattleStatusSyncProps = {
  battleId: string;
  status: string;
  endsAt: string | Date | null;
};

export function BattleStatusSync({
  battleId,
  status,
  endsAt,
}: BattleStatusSyncProps) {
  const router = useRouter();
  const isSyncingRef = useRef(false);
  const lastSyncedStatusRef = useRef(status);

  useEffect(() => {
    lastSyncedStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (
      status !== "READY" &&
      status !== "ACTIVE" &&
      status !== "SUBMISSION" &&
      status !== "VOTING"
    ) {
      return;
    }

    if (status === "VOTING" && !endsAt) {
      return;
    }

    async function syncStatus() {
      if (isSyncingRef.current) {
        return;
      }

      isSyncingRef.current = true;

      try {
        const response = await fetch(`/api/battles/${battleId}/sync-status`, {
          method: "POST",
        });
        const data = (await response.json().catch(() => null)) as
          | { status?: string }
          | null;

        if (
          response.ok &&
          data?.status &&
          data.status !== lastSyncedStatusRef.current
        ) {
          lastSyncedStatusRef.current = data.status;
          router.refresh();
        }
      } finally {
        isSyncingRef.current = false;
      }
    }

    const intervalId = window.setInterval(syncStatus, 8000);
    const endsAtTime = endsAt ? new Date(endsAt).getTime() : null;
    const timeoutDelay = endsAtTime
      ? Math.max(0, endsAtTime - Date.now() + 500)
      : null;
    const timeoutId =
      timeoutDelay !== null ? window.setTimeout(syncStatus, timeoutDelay) : null;

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [battleId, endsAt, router, status]);

  return null;
}
