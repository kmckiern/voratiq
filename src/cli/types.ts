import { z } from "zod";

import { agentIdSchema } from "../agents/types.js";

export const voratiqRunPresetSchema = z.object({
  specPath: z.string(),
  agents: z.array(agentIdSchema).optional(),
});

export type VoratiqRunPreset = z.infer<typeof voratiqRunPresetSchema>;

export const voratiqPresetMapSchema = z.record(
  z.string(),
  voratiqRunPresetSchema,
);

export const voratiqConfigSchema = z.object({
  default: voratiqRunPresetSchema.optional(),
  presets: voratiqPresetMapSchema.optional(),
});

export type VoratiqConfig = z.infer<typeof voratiqConfigSchema>;
