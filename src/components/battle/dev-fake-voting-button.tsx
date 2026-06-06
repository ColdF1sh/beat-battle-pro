"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type DevFakeVotingButtonProps = {
  battleId: string;
};

export function DevFakeVotingButton({ battleId }: DevFakeVotingButtonProps) {
  const router = useRouter();
  const [isVoting, setIsVoting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function autoVote() {
    setIsVoting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/dev/fake-voting/auto-vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          battleId,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            status: "success";
            createdVotes: number;
            battleStatus: string;
          }
        | {
            error?: string;
          }
        | null;

      if (!response.ok || !data || !("status" in data)) {
        setError(
          data && "error" in data && data.error
            ? data.error
            : "Could not create fake player votes.",
        );
        return;
      }

      setMessage(
        `Fake players submitted ${data.createdVotes} vote${
          data.createdVotes === 1 ? "" : "s"
        }. Battle status: ${data.battleStatus}.`,
      );
      router.refresh();
    } catch {
      setError("Could not create fake player votes.");
    } finally {
      setIsVoting(false);
    }
  }

  return (
    <div className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-300/10 p-3">
      <Button
        type="button"
        size="sm"
        disabled={isVoting}
        onClick={autoVote}
        className="border border-fuchsia-200/30 bg-fuchsia-300/20 text-fuchsia-50 hover:bg-fuchsia-300/30"
      >
        {isVoting ? "Voting..." : "DEV ONLY - Fake players vote"}
      </Button>
      {message ? <p className="mt-2 text-sm text-fuchsia-100">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
    </div>
  );
}
