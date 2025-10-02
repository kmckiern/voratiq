import type { AgentId } from "../agents/types.js";

export interface BuildAgentPromptOptions {
  runId: string;
  agentId: AgentId;
  specPath: string;
  specContent: string;
}

export function buildAgentPrompt(options: BuildAgentPromptOptions): string {
  const { runId, agentId, specPath, specContent } = options;

  const lines = [
    `Voratiq run ${runId}`,
    `Agent: ${agentId}`,
    "",
    "Specification:",
    `Path: ${specPath}`,
    "",
    specContent.trimEnd(),
    "",
    "Instructions:",
    "- Apply the specification by editing files inside this workspace only.",
    "- Write a one- or two-sentence summary to .summary.txt in the workspace root.",
    "- Do not run git commands or touch repository metadata.",
    "- Exit once the work is complete.",
  ];

  return `${lines.join("\n")}\n`;
}
