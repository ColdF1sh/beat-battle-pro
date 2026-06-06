import { BattlePageClient } from "@/components/battle/battle-page-client";

export default function BattlePage() {
  const enableDevFakePlayers =
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_FAKE_PLAYERS === "true";

  return <BattlePageClient enableDevFakePlayers={enableDevFakePlayers} />;
}
