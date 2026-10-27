import { z } from "zod";

export const healthInputSchema = z.object({});

export const healthOutputSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const projectListOutputSchema = z.array(projectSchema);
