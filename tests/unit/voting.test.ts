import { describe, expect, it } from "vitest";

import { calculateScoreTotals, validateScoreVote } from "@/lib/battle/voting";
import { voteSchema } from "@/lib/validations/battle";

describe("score voting", () => {
  it("totals 1-10 score votes by participant", () => {
    const scores = calculateScoreTotals([
      { participantId: "p1", score: 10 },
      { participantId: "p2", score: 7 },
      { participantId: "p1", score: 8 },
    ]);

    expect(scores.get("p1")).toBe(18);
    expect(scores.get("p2")).toBe(7);
  });

  it("rejects duplicate scored submissions", () => {
    const result = validateScoreVote({
      scores: [
        { participantId: "p1", score: 8 },
        { participantId: "p1", score: 6 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects self-votes", () => {
    expect(
      validateScoreVote({
        voterParticipantId: "me",
        scores: [
          { participantId: "opponent-1", score: 8 },
          { participantId: "me", score: 10 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects missing eligible opponent scores", () => {
    expect(
      validateScoreVote({
        validParticipantIds: ["p1", "p2", "p3"],
        scores: [
          { participantId: "p1", score: 8 },
          { participantId: "p2", score: 7 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects scores outside 1-10", () => {
    expect(
      voteSchema.safeParse({
        scores: [{ participantId: "p1", score: 11 }],
      }).success,
    ).toBe(false);
  });
});
