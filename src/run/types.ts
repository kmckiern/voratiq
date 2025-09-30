import type { AgentId } from "../agents/types";

export interface SpecReference {
  path: string;
  sha256: string;
}

export interface AgentAssets {
  stdout: string;
  stderr: string;
}

export type AgentStatus = "succeeded" | "failed" | "running" | "pending";

export interface Agent {
  agentId: AgentId;
  model: string;
  binaryPath: string;
  argv: string[];
  prompt: string;
  workspacePath: string;
  startedAt: string;
  completedAt: string;
  status: AgentStatus;
  assets: AgentAssets;
}

export interface RunRecord {
  runId: string;
  spec: SpecReference;
  createdAt: string;
  baseRevision: string;
  rootPath: string;
  agents: Agent[];
}
