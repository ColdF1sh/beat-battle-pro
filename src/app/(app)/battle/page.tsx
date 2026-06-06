import { BattlePageClient } from "@/components/battle/battle-page-client";
import { isBattleDevToolsEnabled } from "@/lib/battle/dev-tools";

export default function BattlePage() {
  const enableDevFakePlayers = isBattleDevToolsEnabled();

  return <BattlePageClient enableDevFakePlayers={enableDevFakePlayers} />;
}
