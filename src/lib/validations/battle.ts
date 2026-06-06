import { z } from "zod";

export const battleParamsSchema = z.object({
  battleId: z.string().min(1, "Battle ID is required."),
});

export const voteSchema = z.object({
  scores: z
    .array(
      z.object({
        participantId: z.string().min(1, "Participant is required."),
        score: z.number().int().min(1).max(10),
      }),
    )
    .min(1, "Score every eligible submission before submitting."),
});

export type VoteInput = z.infer<typeof voteSchema>;
