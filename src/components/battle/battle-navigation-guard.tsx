"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { gameButtonClassName } from "@/components/ui/game-button";

type BattleNavigationGuardProps = {
  battleId: string;
  shouldConfirm: boolean;
  mode: string;
  status: string;
  producerElo: number | null;
  rapElo: number | null;
};

export function BattleNavigationGuard({
  battleId,
  shouldConfirm,
  mode,
  status,
  producerElo,
  rapElo,
}: BattleNavigationGuardProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetHref, setTargetHref] = useState("/battle");

  useEffect(() => {
    function openLeaveDialog(href = "/battle") {
      if (!shouldConfirm) {
        router.push(href);
        return;
      }

      setTargetHref(href);
      setError(null);
      setIsOpen(true);
    }

    function handleRequestLeave(event: Event) {
      const detail = (event as CustomEvent<{ href?: string }>).detail;

      openLeaveDialog(detail?.href ?? "/battle");
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!shouldConfirm || event.defaultPrevented) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest("a");

      if (!link || link.target || link.hasAttribute("download")) {
        return;
      }

      const href = link.getAttribute("href");

      if (!href || href.startsWith("#")) {
        return;
      }

      const url = new URL(href, window.location.href);
      const currentBattlePath = `/battle/${battleId}`;
      const isSameBattlePath = url.pathname.startsWith(currentBattlePath);
      const isAssetOrApiDownload =
        url.pathname.startsWith("/api/sound-packs/") ||
        url.pathname.startsWith("/api/generated-battle-packs/") ||
        url.pathname.startsWith("/demo-audio/") ||
        url.pathname.startsWith("/demo-sounds/");

      if (
        url.origin !== window.location.origin ||
        isSameBattlePath ||
        isAssetOrApiDownload
      ) {
        return;
      }

      event.preventDefault();
      openLeaveDialog(`${url.pathname}${url.search}${url.hash}`);
    }

    window.addEventListener("beat-battle-request-leave", handleRequestLeave);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beat-battle-request-leave", handleRequestLeave);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [battleId, router, shouldConfirm]);

  useEffect(() => {
    if (!shouldConfirm) {
      return;
    }

    window.history.pushState(null, "", window.location.href);

    function handlePopState() {
      window.history.pushState(null, "", window.location.href);
      setTargetHref("/battle");
      setError(null);
      setIsOpen(true);
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [shouldConfirm]);

  const isRapBattle = mode.startsWith("rap_");
  const relevantElo = isRapBattle ? rapElo : producerElo;
  const estimatedPenalty = status === "FINISHED" || status === "CANCELLED" ? 0 : 30;
  const penaltyLabel =
    relevantElo === null
      ? "No Elo penalty while unqualified"
      : `-${estimatedPenalty} Elo`;

  async function abandonBattle() {
    setIsLeaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/battles/${battleId}/abandon`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not abandon match.");
        return;
      }

      router.push(targetHref);
      router.refresh();
    } catch {
      setError("Could not abandon match.");
    } finally {
      setIsLeaving(false);
    }
  }

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="abandon-battle-title"
      aria-describedby="abandon-battle-description"
    >
      <div className="bb-graffiti-texture relative w-full max-w-[500px] overflow-hidden rounded-xl border border-rose-300/45 bg-zinc-950 p-5 text-white shadow-[0_0_100px_rgba(244,63,94,0.36)]">
        <div className="pointer-events-none absolute inset-0 animate-pulse border border-rose-300/20" />
        <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 border-r-2 border-t-2 border-rose-300/45" />
        <div className="flex flex-col gap-2">
          <h2
            id="abandon-battle-title"
            className="bb-kinetic-title text-[clamp(2rem,6vw,3.75rem)] leading-none text-white"
          >
            Abandon competitive match?
          </h2>
          <p id="abandon-battle-description" className="text-sm font-semibold text-zinc-300">
            Leaving now will count as abandoning the match. The penalty is
            category-specific and applies once.
          </p>
          <div className="mt-3 border border-rose-300/30 bg-rose-500/10 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">
              Estimated penalty
            </p>
            <p className="mt-1 text-xl font-black uppercase text-white">
              {penaltyLabel}
            </p>
          </div>
        </div>
        {error ? (
          <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
        <div className="-mx-5 -mb-5 mt-5 grid gap-2 border-t border-white/10 bg-black/20 p-4 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            disabled={isLeaving}
            onClick={() => setIsOpen(false)}
            className="h-11 w-full border-white/15 bg-white/[0.04] text-zinc-100 hover:bg-white/10"
          >
            Cancel
          </Button>
          <button
            type="button"
            disabled={isLeaving}
            onClick={abandonBattle}
            className={gameButtonClassName("danger", "h-11 w-full px-4")}
          >
            {isLeaving ? "Abandoning..." : "Abandon match"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
