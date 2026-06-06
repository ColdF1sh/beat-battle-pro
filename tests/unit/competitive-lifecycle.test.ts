import { BattleParticipantPresence, BattleStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  getAbandonPenaltyForStatus,
  getReconnectExpiresAt,
  isActiveBattleParticipantEligible,
  MATCH_RECONNECT_GRACE_SECONDS,
} from "@/lib/battle/competitive-lifecycle";

describe("competitive match lifecycle", () => {
  it("uses a fixed abandon penalty for unfinished battles", () => {
    expect(getAbandonPenaltyForStatus(BattleStatus.WAITING)).toBe(30);
    expect(getAbandonPenaltyForStatus(BattleStatus.READY)).toBe(30);
    expect(getAbandonPenaltyForStatus(BattleStatus.DRAFTING)).toBe(30);
    expect(getAbandonPenaltyForStatus(BattleStatus.ACTIVE)).toBe(30);
    expect(getAbandonPenaltyForStatus(BattleStatus.SUBMISSION)).toBe(30);
    expect(getAbandonPenaltyForStatus(BattleStatus.VOTING)).toBe(30);
    expect(getAbandonPenaltyForStatus(BattleStatus.FINISHED)).toBe(0);
    expect(getAbandonPenaltyForStatus(BattleStatus.CANCELLED)).toBe(0);
  });

  it("creates a reconnect deadline from the configured grace period", () => {
    const now = new Date("2026-06-04T12:00:00.000Z");
    const deadline = getReconnectExpiresAt(now);

    expect(deadline.getTime() - now.getTime()).toBe(
      MATCH_RECONNECT_GRACE_SECONDS * 1000,
    );
  });

  it("excludes explicitly left participants from active battle lookup", () => {
    expect(
      isActiveBattleParticipantEligible({
        presenceStatus: BattleParticipantPresence.CONNECTED,
        forfeited: false,
        leftAt: null,
        leavePenaltyAppliedAt: null,
      }),
    ).toBe(true);
    expect(
      isActiveBattleParticipantEligible({
        presenceStatus: BattleParticipantPresence.ABANDONED,
        forfeited: false,
        leftAt: null,
        leavePenaltyAppliedAt: null,
      }),
    ).toBe(false);
    expect(
      isActiveBattleParticipantEligible({
        presenceStatus: BattleParticipantPresence.CONNECTED,
        forfeited: true,
        leftAt: null,
        leavePenaltyAppliedAt: null,
      }),
    ).toBe(false);
    expect(
      isActiveBattleParticipantEligible({
        presenceStatus: BattleParticipantPresence.CONNECTED,
        forfeited: false,
        leftAt: new Date("2026-06-06T00:00:00.000Z"),
        leavePenaltyAppliedAt: null,
      }),
    ).toBe(false);
    expect(
      isActiveBattleParticipantEligible({
        presenceStatus: BattleParticipantPresence.CONNECTED,
        forfeited: false,
        leftAt: null,
        leavePenaltyAppliedAt: new Date("2026-06-06T00:00:00.000Z"),
      }),
    ).toBe(false);
  });
});
