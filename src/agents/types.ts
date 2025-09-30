import { z } from "zod";

export const KNOWN_AGENT_IDS = ["claude-code", "codex"] as const;
export const agentIdSchema = z.enum(KNOWN_AGENT_IDS);
export type AgentId = z.infer<typeof agentIdSchema>;
