import { describe, expect, it } from "vitest";

import { registerSchema } from "@/lib/validations/auth";
import { voteSchema } from "@/lib/validations/battle";
import { leaderboardQuerySchema } from "@/lib/validations/leaderboard";
import { matchmakingSearchSchema } from "@/lib/validations/matchmaking";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_UPLOAD_SIZE_BYTES,
} from "@/lib/validations/upload";

describe("validation schemas", () => {
  it("accepts registration without displayName and normalizes identity fields", () => {
    const result = registerSchema.safeParse({
      email: "TEST@EXAMPLE.COM",
      username: "Test_User",
      password: "password123",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        email: "test@example.com",
        username: "test_user",
        password: "password123",
      });
    }
  });

  it("enforces username length and character rules", () => {
    expect(
      registerSchema.safeParse({
        email: "test@example.com",
        username: "ab",
        password: "password123",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "test@example.com",
        username: "bad-name",
        password: "password123",
      }).success,
    ).toBe(false);
  });

  it("accepts enabled matchmaking modes and rejects unavailable modes", () => {
    expect(
      matchmakingSearchSchema.safeParse({
        modes: ["beatmaking_strict", "beatmaking_free_flying"],
        durationMinutes: 20,
      }).success,
    ).toBe(true);
    expect(
      matchmakingSearchSchema.safeParse({
        modes: ["rap_strict"],
      }).success,
    ).toBe(false);
  });

  it("requires 1-10 score vote entries", () => {
    expect(
      voteSchema.safeParse({
        scores: [
          {
            participantId: "p1",
            score: 10,
          },
          {
            participantId: "p2",
            score: 7,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      voteSchema.safeParse({
        scores: [
          {
            participantId: "p1",
            score: 11,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("caps leaderboard limit at 100", () => {
    expect(
      leaderboardQuerySchema.safeParse({
        category: "beatmaking",
        limit: "100",
      }).success,
    ).toBe(true);
    expect(
      leaderboardQuerySchema.safeParse({
        category: "overall",
        limit: "101",
      }).success,
    ).toBe(false);
  });

  it("exports upload limits and accepted audio formats", () => {
    expect(MAX_AUDIO_UPLOAD_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(ALLOWED_AUDIO_EXTENSIONS.has(".mp3")).toBe(true);
    expect(ALLOWED_AUDIO_EXTENSIONS.has(".exe")).toBe(false);
    expect(ALLOWED_AUDIO_MIME_TYPES.has("audio/mpeg")).toBe(true);
  });
});
