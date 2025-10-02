import { loadAgentCatalog } from "../../src/agents/config.js";

describe("loadAgentCatalog", () => {
  it("reads agent configuration from environment variables", () => {
    const env = {
      VORATIQ_AGENT_CLAUDE_CODE_BINARY: "/bin/claude",
      VORATIQ_AGENT_CLAUDE_CODE_ARGV: JSON.stringify(["--headless", "--json"]),
      VORATIQ_AGENT_CLAUDE_CODE_MODEL: "claude-code-1",
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_CODEX_ARGV: JSON.stringify(["--json"]),
      VORATIQ_AGENT_CODEX_MODEL: "gpt-codex",
    };

    const catalog = loadAgentCatalog({ env });

    expect(catalog).toEqual([
      {
        id: "claude-code",
        model: "claude-code-1",
        binaryPath: "/bin/claude",
        argv: ["--headless", "--json"],
      },
      {
        id: "codex",
        model: "gpt-codex",
        binaryPath: "/bin/codex",
        argv: ["--json"],
      },
    ]);
  });

  it("throws when required variables are missing", () => {
    expect(() => loadAgentCatalog({ env: {} })).toThrow(
      /VORATIQ_AGENT_CLAUDE_CODE_BINARY/u,
    );
  });
});
