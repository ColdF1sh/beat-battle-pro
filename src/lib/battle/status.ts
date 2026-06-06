import { BattleStatus } from "@prisma/client";

export const battleStatusDetails: Record<
  BattleStatus,
  {
    label: string;
    title: string;
    description: string;
    badgeClassName: string;
  }
> = {
  [BattleStatus.WAITING]: {
    label: "Waiting",
    title: "Waiting for players",
    description: "The room is filling before the battle starts.",
    badgeClassName: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  },
  [BattleStatus.READY]: {
    label: "Ready Check",
    title: "Ready Check",
    description: "Players confirm before the battle opens.",
    badgeClassName: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  },
  [BattleStatus.DRAFTING]: {
    label: "Drafting",
    title: "Draft rules",
    description: "Ban options until one ruleset remains.",
    badgeClassName: "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-200",
  },
  [BattleStatus.ACTIVE]: {
    label: "Battle",
    title: "Battle",
    description: "Create your beat and watch the room timer.",
    badgeClassName: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100",
  },
  [BattleStatus.SUBMISSION]: {
    label: "Submission",
    title: "Submission",
    description: "Upload your finished battle submission.",
    badgeClassName: "border-violet-300/30 bg-violet-300/10 text-violet-200",
  },
  [BattleStatus.VOTING]: {
    label: "Voting",
    title: "Voting",
    description: "Vote for the best submission in the room.",
    badgeClassName: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  },
  [BattleStatus.FINISHED]: {
    label: "Results",
    title: "Results",
    description: "Winner and score breakdown will appear here.",
    badgeClassName: "border-violet-300/30 bg-violet-400/10 text-violet-100",
  },
  [BattleStatus.CANCELLED]: {
    label: "Cancelled",
    title: "Cancelled",
    description: "This room is no longer active.",
    badgeClassName: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  },
};

export const battleStatusFlow = [
  BattleStatus.WAITING,
  BattleStatus.READY,
  BattleStatus.DRAFTING,
  BattleStatus.ACTIVE,
  BattleStatus.SUBMISSION,
  BattleStatus.VOTING,
  BattleStatus.FINISHED,
  BattleStatus.CANCELLED,
];

export function getBattleStatusLabel(status: BattleStatus) {
  return battleStatusDetails[status].label;
}

export function getBattleStatusDescription(status: BattleStatus) {
  return battleStatusDetails[status].description;
}

export function getBattleStatusBadgeClassName(status: BattleStatus) {
  return battleStatusDetails[status].badgeClassName;
}

export function canSubmit(status: BattleStatus) {
  return status === BattleStatus.SUBMISSION;
}

export function canVote(status: BattleStatus) {
  return status === BattleStatus.VOTING;
}
