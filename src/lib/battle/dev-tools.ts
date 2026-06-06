export function isBattleDevToolsEnabled() {
  return (
    process.env.ENABLE_BATTLE_DEV_TOOLS === "true" ||
    process.env.ENABLE_DEV_FAKE_PLAYERS === "true"
  );
}

export function getBattleDevToolsDisabledMessage(feature = "Battle dev tools") {
  return `${feature} are disabled. Set ENABLE_BATTLE_DEV_TOOLS=true or ENABLE_DEV_FAKE_PLAYERS=true.`;
}
