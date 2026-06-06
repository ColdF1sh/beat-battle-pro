"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type DevSeedFakeSubmissionsButtonProps = {
  battleId: string;
};

export function DevSeedFakeSubmissionsButton({
  battleId,
}: DevSeedFakeSubmissionsButtonProps) {
  const router = useRouter();
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function seed() {
    setIsSeeding(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/dev/battles/${battleId}/seed-fake-submissions`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => null)) as
        | {
            status?: "success";
            created?: number;
            updated?: number;
            error?: string;
          }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not seed fake submissions.");
        return;
      }

      setMessage(
        `Fake submissions ready. Created ${data?.created ?? 0}, updated ${
          data?.updated ?? 0
        }.`,
      );
      router.refresh();
    } catch {
      setError("Could not seed fake submissions.");
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <div className="rounded-lg border border-violet-300/25 bg-violet-300/10 p-3">
      <Button
        type="button"
        size="sm"
        disabled={isSeeding}
        onClick={seed}
        className="border border-violet-200/30 bg-violet-300/20 text-violet-50 hover:bg-violet-300/30"
      >
        {isSeeding ? "Seeding..." : "DEV ONLY - Seed fake submissions"}
      </Button>
      {message ? <p className="mt-2 text-sm text-violet-100">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
    </div>
  );
}
