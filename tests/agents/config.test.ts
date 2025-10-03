import { loadAgentCatalog } from "../../src/agents/config.js";

describe("loadAgentCatalog", () => {
  it("reads agent configuration from environment variables", () => {
    const env = {
      VORATIQ_AGENT_CLAUDE_CODE_BINARY: "/bin/claude",
      VORATIQ_AGENT_CLAUDE_CODE_ARGV: JSON.stringify([
        "--headless",
        "--json",
        "--model",
        "{{MODEL}}",
      ]),
      VORATIQ_AGENT_CLAUDE_CODE_MODEL: "claude-code-1",
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_CODEX_ARGV: JSON.stringify([
        "--json",
        "--model",
        "{{MODEL}}",
      ]),
      VORATIQ_AGENT_CODEX_MODEL: "gpt-codex",
    };

    const catalog = loadAgentCatalog({ env });

    expect(catalog).toEqual([
      {
        id: "claude-code",
        model: "claude-code-1",
        binaryPath: "/bin/claude",
        argv: ["--headless", "--json", "--model", "claude-code-1"],
      },
      {
        id: "codex",
        model: "gpt-codex",
        binaryPath: "/bin/codex",
        argv: ["--json", "--model", "gpt-codex"],
      },
    ]);
  });

  it("throws when required variables are missing", () => {
    expect(() => loadAgentCatalog({ env: {} })).toThrow(
      /VORATIQ_AGENT_CLAUDE_CODE_BINARY/u,
    );
  });

  it("throws when the model variable is missing", () => {
    const env = {
      VORATIQ_AGENT_CLAUDE_CODE_BINARY: "/bin/claude",
      VORATIQ_AGENT_CLAUDE_CODE_ARGV: JSON.stringify(["--model", "{{MODEL}}"]),
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_CODEX_ARGV: JSON.stringify(["--model", "{{MODEL}}"]),
    };

    expect(() => loadAgentCatalog({ env })).toThrow(/_MODEL/u);
  });

  it("throws when argv does not include the model placeholder", () => {
    const env = {
      VORATIQ_AGENT_CLAUDE_CODE_BINARY: "/bin/claude",
      VORATIQ_AGENT_CLAUDE_CODE_ARGV: JSON.stringify(["--headless"]),
      VORATIQ_AGENT_CLAUDE_CODE_MODEL: "claude-code-1",
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_CODEX_ARGV: JSON.stringify(["--json"]),
      VORATIQ_AGENT_CODEX_MODEL: "gpt-codex",
    };

    expect(() => loadAgentCatalog({ env })).toThrow(/\{\{MODEL\}\}/u);
  });
});
