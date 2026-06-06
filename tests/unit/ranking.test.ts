import { describe, expect, it } from "vitest";

import {
  getEloMultiplier,
  getRankFromElo,
  STARTING_ELO,
} from "@/lib/ranking/elo-config";
import { calculateBattleEloResults } from "@/lib/ranking/calculate-battle-elo";

describe("ranking and Elo", () => {
  it("uses 500 as the starting Elo", () => {
    expect(STARTING_ELO).toBe(500);
  });

  it.each([
    [0, "Bedroom III"],
    [420, "Tin Foil III"],
    [840, "Bronze III"],
    [1260, "Silver III"],
    [1680, "Gold III"],
    [2100, "Platinum III"],
    [2500, "Grammy Winner"],
  ])("maps %i Elo to %s", (elo, rankName) => {
    expect(getRankFromElo(elo).name).toBe(rankName);
  });

  it("gives high Elo players a lower multiplier than low Elo players", () => {
    expect(getEloMultiplier(2400)).toBeLessThan(getEloMultiplier(700));
  });

  it("never drops Elo below zero", () => {
    const results = calculateBattleEloResults([
      { userId: "a", eloRating: 100, totalVotePoints: 10 },
      { userId: "b", eloRating: 100, totalVotePoints: 8 },
      { userId: "c", eloRating: 100, totalVotePoints: 6 },
      { userId: "d", eloRating: 5, totalVotePoints: 4 },
      { userId: "e", eloRating: 5, totalVotePoints: 0 },
    ]);

    expect(results.every((result) => result.newElo >= 0)).toBe(true);
    expect(results.find((result) => result.userId === "e")?.newElo).toBe(0);
  });

  it("produces positive and negative Elo changes by ranked placement", () => {
    const results = calculateBattleEloResults([
      { userId: "first", eloRating: 500, totalVotePoints: 12 },
      { userId: "second", eloRating: 500, totalVotePoints: 9 },
      { userId: "third", eloRating: 500, totalVotePoints: 6 },
      { userId: "fourth", eloRating: 500, totalVotePoints: 3 },
      { userId: "fifth", eloRating: 500, totalVotePoints: 0 },
    ]);

    expect(results.find((result) => result.userId === "first")).toMatchObject({
      placement: 1,
      eloChange: 30,
    });
    expect(results.find((result) => result.userId === "third")?.eloChange).toBe(
      6,
    );
    expect(results.find((result) => result.userId === "fifth")).toMatchObject({
      placement: 5,
      eloChange: -30,
    });
  });

  it("averages placement changes for ties deterministically", () => {
    const results = calculateBattleEloResults([
      { userId: "a", eloRating: 500, totalVotePoints: 10 },
      { userId: "b", eloRating: 500, totalVotePoints: 10 },
      { userId: "c", eloRating: 500, totalVotePoints: 5 },
    ]);

    expect(results.filter((result) => result.placement === 1)).toHaveLength(2);
    expect(results[0].eloChange).toBe(results[1].eloChange);
  });
});
