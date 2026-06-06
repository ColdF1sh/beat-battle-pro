import { describe, expect, it } from "vitest";

import {
  canMatchQueueEntry,
  isFreshQueueEntry,
  isReusableMatchmakingBattle,
  MATCHMAKING_BATTLE_SOURCE,
  pickOldestValidQueueEntry,
} from "@/lib/matchmaking/rules";

describe("matchmaking safety rules", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("treats queue entries older than 30 minutes as stale", () => {
    expect(
      isFreshQueueEntry(
        {
          status: "SEARCHING",
          createdAt: new Date("2026-01-01T11:31:00.000Z"),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isFreshQueueEntry(
        {
          status: "SEARCHING",
          createdAt: new Date("2026-01-01T11:29:59.000Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("never reuses finished, cancelled, non-matchmaking, or old battles", () => {
    expect(
      isReusableMatchmakingBattle(
        {
          source: MATCHMAKING_BATTLE_SOURCE,
          status: "FINISHED",
          createdAt: new Date("2026-01-01T11:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isReusableMatchmakingBattle(
        {
          source: MATCHMAKING_BATTLE_SOURCE,
          status: "CANCELLED",
          createdAt: new Date("2026-01-01T11:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isReusableMatchmakingBattle(
        {
          source: "MANUAL",
          status: "WAITING",
          createdAt: new Date("2026-01-01T11:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isReusableMatchmakingBattle(
        {
          source: MATCHMAKING_BATTLE_SOURCE,
          status: "WAITING",
          createdAt: new Date("2026-01-01T05:59:59.000Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("allows only fresh matchmaking battles in active flow statuses", () => {
    expect(
      isReusableMatchmakingBattle(
        {
          source: MATCHMAKING_BATTLE_SOURCE,
          status: "WAITING",
          createdAt: new Date("2026-01-01T06:00:00.000Z"),
        },
        now,
      ),
    ).toBe(true);
  });

  it("does not match a user with themselves", () => {
    expect(
      canMatchQueueEntry(
        {
          userId: "user-1",
          status: "SEARCHING",
          createdAt: new Date("2026-01-01T11:59:00.000Z"),
        },
        "user-1",
        now,
      ),
    ).toBe(false);
  });

  it("prefers the oldest valid queue entry", () => {
    const match = pickOldestValidQueueEntry(
      [
        {
          userId: "newer",
          status: "SEARCHING",
          createdAt: new Date("2026-01-01T11:59:00.000Z"),
        },
        {
          userId: "oldest",
          status: "SEARCHING",
          createdAt: new Date("2026-01-01T11:40:00.000Z"),
        },
        {
          userId: "stale",
          status: "SEARCHING",
          createdAt: new Date("2026-01-01T11:00:00.000Z"),
        },
      ],
      "current",
      now,
    );

    expect(match?.userId).toBe("oldest");
  });
});
