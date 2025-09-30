import { z } from "zod";

export const voratiqRunPresetSchema = z.object({
  specPath: z.string(),
});

export type VoratiqRunPreset = z.infer<typeof voratiqRunPresetSchema>;

export const voratiqPresetMapSchema = z.record(voratiqRunPresetSchema);

export const voratiqConfigSchema = z.object({
  default: voratiqRunPresetSchema.optional(),
  presets: voratiqPresetMapSchema.optional(),
});

export type VoratiqConfig = z.infer<typeof voratiqConfigSchema>;
