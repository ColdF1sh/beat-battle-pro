export const PresenceStatus = {
  ONLINE: "ONLINE",
  SEARCHING: "SEARCHING",
  IN_BATTLE: "IN_BATTLE",
  OFFLINE: "OFFLINE",
} as const;

export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

export function getPresenceLabel(status: PresenceStatus) {
  switch (status) {
    case PresenceStatus.ONLINE:
      return "Online";
    case PresenceStatus.SEARCHING:
      return "Searching";
    case PresenceStatus.IN_BATTLE:
      return "In battle";
    case PresenceStatus.OFFLINE:
      return "Offline";
  }
}

export function getPresenceColorClass(status: PresenceStatus) {
  switch (status) {
    case PresenceStatus.ONLINE:
      return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
    case PresenceStatus.SEARCHING:
      return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
    case PresenceStatus.IN_BATTLE:
      return "border-violet-300/30 bg-violet-300/10 text-violet-100";
    case PresenceStatus.OFFLINE:
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
  }
}
