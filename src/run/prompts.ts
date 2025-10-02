export interface BuildAgentPromptOptions {
  specContent: string;
}

export function buildAgentPrompt(options: BuildAgentPromptOptions): string {
  const { specContent } = options;

  const lines = [
    "Implement the following specification:",
    "",
    specContent.trimEnd(),
    "",
    "Instructions:",
    "- Edit files inside this workspace only.",
    "- Write a one- or two-sentence summary to .summary.txt in the workspace root.",
    "- Do not run git commands or modify repository metadata.",
    "- Exit after completing the work.",
  ];

  return `${lines.join("\n")}\n`;
}
