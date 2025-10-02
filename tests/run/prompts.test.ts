import { buildAgentPrompt } from "../../src/run/prompts.js";

describe("buildAgentPrompt", () => {
  it("includes spec metadata, content, and instructions", () => {
    const prompt = buildAgentPrompt({
      runId: "20251001-143500-fghij",
      agentId: "claude-code",
      specPath: "specs/example.md",
      specContent: "# Example\nDo the work.",
    });

    expect(prompt).toContain("Voratiq run 20251001-143500-fghij");
    expect(prompt).toContain("Agent: claude-code");
    expect(prompt).toContain("Specification:");
    expect(prompt).toContain("Path: specs/example.md");
    expect(prompt).toContain("# Example\nDo the work.");
    expect(prompt).toContain("Write a one- or two-sentence summary");
    expect(prompt).toContain("Do not run git commands");
  });
});
