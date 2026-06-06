"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { gameButtonClassName } from "@/components/ui/game-button";

type DevSkipPhaseButtonProps = {
  battleId: string;
};

export function DevSkipPhaseButton({ battleId }: DevSkipPhaseButtonProps) {
  const router = useRouter();
  const [isSkipping, setIsSkipping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function skipPhase() {
    setIsSkipping(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/dev/battles/${battleId}/skip-phase`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | { status: "success"; from: string; to: string }
        | { error?: string }
        | null;

      if (!response.ok || !data || !("status" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Could not skip phase.",
        );
        return;
      }

      setMessage(`${data.from} -> ${data.to}`);
      router.refresh();
    } catch {
      setError("Could not skip phase.");
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isSkipping}
        onClick={skipPhase}
        className={gameButtonClassName("dev", "h-10 px-3 text-[11px]")}
      >
        {isSkipping ? "Skipping..." : "DEV ONLY - Skip phase"}
      </button>
      {message ? (
        <p className="text-right text-xs font-semibold text-fuchsia-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="max-w-56 text-right text-xs font-semibold text-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
