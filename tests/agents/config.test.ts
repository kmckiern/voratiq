import { loadAgentCatalog } from "../../src/agents/config.js";

describe("loadAgentCatalog", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads agent configuration from environment variables", () => {
    const env = {
      VORATIQ_AGENT_CLAUDE_CODE_BINARY: "/bin/claude",
      VORATIQ_AGENT_CLAUDE_CODE_MODEL: "claude-code-1",
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_CODEX_MODEL: "gpt-codex",
      VORATIQ_AGENT_GEMINI_BINARY: "/bin/gemini",
      VORATIQ_AGENT_GEMINI_MODEL: "gemini-1.5-flash",
    } as const;

    const catalog = loadAgentCatalog({ env });

    expect(catalog).toEqual([
      {
        id: "claude-code",
        model: "claude-code-1",
        binaryPath: "/bin/claude",
        argv: [
          "--model",
          "claude-code-1",
          "--output-format",
          "json",
          "--permission-mode",
          "acceptEdits",
          "--allowedTools",
          "Bash,Read,Edit",
          "-p",
        ],
      },
      {
        id: "codex",
        model: "gpt-codex",
        binaryPath: "/bin/codex",
        argv: [
          "exec",
          "--model",
          "gpt-codex",
          "--sandbox",
          "workspace-write",
          "--experimental-json",
          "--full-auto",
          "-c",
          "mcp_servers={}",
        ],
      },
      {
        id: "gemini",
        model: "gemini-1.5-flash",
        binaryPath: "/bin/gemini",
        argv: [
          "generate",
          "--model",
          "gemini-1.5-flash",
          "--output-format",
          "json",
          "--approval-mode",
          "auto_edit",
        ],
      },
    ]);
  });

  it("appends optional argv extras from environment variables", () => {
    const env = {
      VORATIQ_AGENT_CLAUDE_CODE_BINARY: "/bin/claude",
      VORATIQ_AGENT_CLAUDE_CODE_MODEL: "claude-code-1",
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_CODEX_MODEL: "gpt-codex",
      VORATIQ_AGENT_GEMINI_BINARY: "/bin/gemini",
      VORATIQ_AGENT_GEMINI_MODEL: "gemini-1.5-flash",
      VORATIQ_AGENT_GEMINI_ARGV: JSON.stringify(["--temperature", "0.3"]),
    } as const;

    const catalog = loadAgentCatalog({ env });
    const gemini = catalog.find((agent) => agent.id === "gemini");

    expect(gemini).toBeDefined();
    expect(gemini?.argv).toEqual([
      "generate",
      "--model",
      "gemini-1.5-flash",
      "--output-format",
      "json",
      "--approval-mode",
      "auto_edit",
      "--temperature",
      "0.3",
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
      VORATIQ_AGENT_CODEX_BINARY: "/bin/codex",
      VORATIQ_AGENT_GEMINI_BINARY: "/bin/gemini",
    } as const;

    expect(() => loadAgentCatalog({ env })).toThrow(/_MODEL/u);
  });
});
