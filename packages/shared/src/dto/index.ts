import { z } from "zod";

// API request/response contracts shared by apps/api and apps/web.
// Add DTOs here as routes are implemented so both sides stay in sync.

export const createEvalRunInput = z.object({
  name: z.string().min(1),
  rubricId: z.string().uuid(),
  judgeModelId: z.string().uuid(),
  taskIds: z.array(z.string().uuid()).min(1),
  modelIds: z.array(z.string().uuid()).min(1),
  notes: z.string().optional(),
});
export type CreateEvalRunInput = z.infer<typeof createEvalRunInput>;

export const submitSpotCheckInput = z.object({
  scoreId: z.string().uuid(),
  reviewer: z.string().min(1),
  humanScore: z.number(),
  agrees: z.boolean().optional(),
  note: z.string().optional(),
});
export type SubmitSpotCheckInput = z.infer<typeof submitSpotCheckInput>;
