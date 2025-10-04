import { z } from "zod";

export const KNOWN_AGENT_IDS = ["claude", "codex", "gemini"] as const;
export const agentIdSchema = z.enum(KNOWN_AGENT_IDS);
export type AgentId = z.infer<typeof agentIdSchema>;

export const agentDefinitionSchema = z.object({
  id: agentIdSchema,
  model: z.string(),
  binaryPath: z.string(),
  argv: z.array(z.string()).default([]),
});

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

export const agentCatalogSchema = z.array(agentDefinitionSchema);
export type AgentCatalog = z.infer<typeof agentCatalogSchema>;
