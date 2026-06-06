import { describe, expect, it } from "vitest";

import {
  canSubmitForParticipant,
  canViewBattle,
  canVoteWithStatus,
  isOwnSubmission,
  isParticipant,
} from "@/lib/api/access-rules";

describe("access control rules", () => {
  const participants = [
    { userId: "user-1", participantId: "participant-1" },
    { userId: "user-2", participantId: "participant-2" },
  ];

  it("allows participants to view protected battle data", () => {
    expect(isParticipant("user-1", participants)).toBe(true);
    expect(canViewBattle("user-1", participants)).toBe(true);
  });

  it("blocks non-participants from protected battle data", () => {
    expect(isParticipant("outsider", participants)).toBe(false);
    expect(canViewBattle("outsider", participants)).toBe(false);
  });

  it("prevents users from submitting for another participant", () => {
    expect(canSubmitForParticipant("user-1", participants[0])).toBe(true);
    expect(canSubmitForParticipant("user-1", participants[1])).toBe(false);
  });

  it("recognizes only the user's own submission", () => {
    expect(isOwnSubmission("user-1", { userId: "user-1" })).toBe(true);
    expect(isOwnSubmission("user-1", { userId: "user-2" })).toBe(false);
  });

  it("allows voting only during VOTING status", () => {
    expect(canVoteWithStatus("VOTING")).toBe(true);
    expect(canVoteWithStatus("SUBMISSION")).toBe(false);
    expect(canVoteWithStatus("FINISHED")).toBe(false);
  });
});
