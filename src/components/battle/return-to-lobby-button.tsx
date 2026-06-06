"use client";

import { useRouter } from "next/navigation";

import { GameButton } from "@/components/ui/game-button";

export function ReturnToLobbyButton() {
  const router = useRouter();

  return (
    <GameButton
      type="button"
      onClick={() => {
        router.replace("/battle");
        router.refresh();
      }}
      className="min-w-56"
    >
      Return to Lobby
    </GameButton>
  );
}
