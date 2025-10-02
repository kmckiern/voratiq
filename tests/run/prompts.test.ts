import { buildAgentPrompt } from "../../src/run/prompts.js";

describe("buildAgentPrompt", () => {
  it("includes spec metadata, content, and instructions", () => {
    const prompt = buildAgentPrompt({
      specContent: "# Example\nDo the work.",
    });

    expect(prompt).toContain("Implement the following specification:");
    expect(prompt).toContain("# Example\nDo the work.");
    expect(prompt).toContain("Write a one- or two-sentence summary");
    expect(prompt).toContain("Do not run git commands");
  });
});
