import { z } from "zod";

import { agentIdSchema } from "../agents/types.js";

export const runSpecDescriptorSchema = z.object({
  path: z.string(),
  sha256: z.string().optional(),
});

export type RunSpecDescriptor = z.infer<typeof runSpecDescriptorSchema>;

export const agentAssetPointersSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  workspace: z.string(),
  diff: z.string().optional(),
  summary: z.string().optional(),
  tests: z.string().optional(),
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

export const agentTestStatusSchema = z.enum(["skipped", "passed", "failed"]);

export type AgentTestStatus = z.infer<typeof agentTestStatusSchema>;

export const agentTestResultSchema = z.object({
  status: agentTestStatusSchema,
  command: z.string().optional(),
  exitCode: z.number().nullable().optional(),
  logPath: z.string().optional(),
});

export type AgentTestResult = z.infer<typeof agentTestResultSchema>;

export const agentInvocationRecordSchema = z.object({
  agentId: agentIdSchema,
  model: z.string(),
  binaryPath: z.string(),
  argv: z.array(z.string()),
  prompt: z.string(),
  workspacePath: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  status: agentStatusSchema,
  summary: z.string().optional(),
  commit: z.string().optional(),
  changeSummary: z.string().optional(),
  assets: agentAssetPointersSchema,
  tests: agentTestResultSchema.optional(),
  error: z.string().optional(),
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
