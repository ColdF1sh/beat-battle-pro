import { z } from "zod";

import { activeBattleModes } from "@/lib/battle/modes";

const activeModeIds = new Set<string>(activeBattleModes.map((mode) => mode.id));

export const matchmakingSearchSchema = z.object({
  modes: z
    .array(z.string().min(1, "Battle mode is required."))
    .min(1, "Select at least one battle mode.")
    .max(5, "Select no more than 5 battle modes.")
    .refine(
      (modes) => modes.every((mode) => activeModeIds.has(mode)),
      "One or more selected battle modes are not available.",
    )
    .transform((modes) => Array.from(new Set(modes))),
  durationMinutes: z.coerce.number().int().positive().optional(),
});

export type MatchmakingSearchInput = z.infer<
  typeof matchmakingSearchSchema
>;
