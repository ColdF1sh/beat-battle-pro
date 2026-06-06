import { z } from "zod";

export const leaderboardQuerySchema = z.object({
  category: z.enum(["beatmaking", "rap", "overall"]).default("overall"),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export type LeaderboardQueryInput = z.infer<typeof leaderboardQuerySchema>;
