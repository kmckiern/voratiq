import { z } from "zod";

import { agentIdSchema } from "../agents/types.js";

export const runSpecDescriptorSchema = z.object({
  path: z.string(),
  sha256: z.string().optional(),
});

export type RunSpecDescriptor = z.infer<typeof runSpecDescriptorSchema>;

export const agentAssetPointersSchema = z.object({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  transcript: z.string().optional(),
});

export type AgentAssetPointers = z.infer<typeof agentAssetPointersSchema>;

export const agentStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentInvocationRecordSchema = z.object({
  agentId: agentIdSchema,
  model: z.string(),
  binaryPath: z.string(),
  argv: z.array(z.string()),
  prompt: z.string(),
  workspacePath: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  status: agentStatusSchema,
  assets: agentAssetPointersSchema,
});

export type AgentInvocationRecord = z.infer<typeof agentInvocationRecordSchema>;

export const runRecordSchema = z.object({
  runId: z.string(),
  spec: runSpecDescriptorSchema,
  createdAt: z.string(),
  baseRevision: z.string(),
  rootPath: z.string(),
  agents: z.array(agentInvocationRecordSchema),
});

export type RunRecord = z.infer<typeof runRecordSchema>;
