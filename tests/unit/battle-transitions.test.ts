import { describe, expect, it } from "vitest";

import {
  shouldFinishBattle,
  shouldMoveBattleToVoting,
} from "@/lib/battle/transition-rules";
import { getQualificationElo } from "@/lib/battle/transitions";

describe("battle transition rules", () => {
  it("moves to voting when all participants submitted", () => {
    expect(
      shouldMoveBattleToVoting({
        status: "SUBMISSION",
        participants: [{ id: "p1" }, { id: "p2" }],
        submissions: [{ participantId: "p1" }, { participantId: "p2" }],
      }),
    ).toBe(true);
  });

  it("moves to voting when the battle timer expired", () => {
    expect(
      shouldMoveBattleToVoting({
        status: "ACTIVE",
        participants: [{ id: "p1" }, { id: "p2" }],
        submissions: [],
        endsAt: new Date("2026-01-01T11:59:00.000Z"),
        now: new Date("2026-01-01T12:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("does not move to voting too early", () => {
    expect(
      shouldMoveBattleToVoting({
        status: "ACTIVE",
        participants: [{ id: "p1" }, { id: "p2" }],
        submissions: [{ participantId: "p1" }],
        endsAt: new Date("2026-01-01T12:01:00.000Z"),
        now: new Date("2026-01-01T12:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("finishes when every eligible voter has voted", () => {
    expect(
      shouldFinishBattle({
        status: "VOTING",
        eloProcessed: false,
        eligibleVoterIds: ["u1", "u2"],
        votedUserIds: ["u2", "u1"],
      }),
    ).toBe(true);
  });

  it("does not finish if Elo was already processed", () => {
    expect(
      shouldFinishBattle({
        status: "VOTING",
        eloProcessed: true,
        eligibleVoterIds: ["u1", "u2"],
        votedUserIds: ["u1", "u2"],
      }),
    ).toBe(false);
  });

  it("does not give max qualification Elo to lower placements", () => {
    const firstPlaceElo = getQualificationElo({
      points: 40,
      maxPoints: 40,
      placement: 1,
      playerCount: 5,
      technicalLoss: false,
    });
    const thirdPlaceElo = getQualificationElo({
      points: 26,
      maxPoints: 40,
      placement: 3,
      playerCount: 5,
      technicalLoss: false,
    });

    expect(firstPlaceElo).toBeGreaterThan(thirdPlaceElo);
    expect(firstPlaceElo).toBe(750);
    expect(thirdPlaceElo).toBeLessThan(750);
  });
});
