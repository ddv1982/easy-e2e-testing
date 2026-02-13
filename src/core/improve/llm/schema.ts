import { z } from "zod";

export const selectorRankResponseSchema = z.object({
  selectedCandidateId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  reasonCodes: z.array(z.string()).optional(),
});

export type SelectorRankResponse = z.infer<typeof selectorRankResponseSchema>;
