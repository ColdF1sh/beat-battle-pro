"use client";

import { AlertTriangleIcon } from "lucide-react";

import { gameButtonClassName } from "@/components/ui/game-button";

export function LeaveBattleButton() {
  function requestLeave() {
    window.dispatchEvent(
      new CustomEvent("beat-battle-request-leave", {
        detail: {
          href: "/battle",
        },
      }),
    );
  }

  return (
    <button
      type="button"
      onClick={requestLeave}
      className={gameButtonClassName(
        "danger",
        "h-11 whitespace-nowrap px-4 text-xs sm:text-sm",
      )}
    >
      <AlertTriangleIcon className="size-4" />
      Leave Battle
    </button>
  );
}
