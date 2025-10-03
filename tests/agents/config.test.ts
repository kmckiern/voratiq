import * as childProcess from "node:child_process";

import {
  __resetAgentConfigForTests,
  loadAgentCatalog,
} from "../../src/agents/config.js";

jest.mock("node:child_process", () => {
  const actual = jest.requireActual("node:child_process");
  return {
    ...actual,
    execFileSync: jest.fn(),
  };
});

const execFileSyncMock = childProcess.execFileSync as jest.MockedFunction<
  typeof childProcess.execFileSync
>;

describe("loadAgentCatalog", () => {
  beforeEach(() => {
    __resetAgentConfigForTests();
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetAgentConfigForTests();
  });

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
      VORATIQ_AGENT_GEMINI_BINARY: "/bin/gemini",
      VORATIQ_AGENT_GEMINI_MODEL: "gemini-1.5-flash",
      VORATIQ_AGENT_GEMINI_ARGV: JSON.stringify([
        "--safety-settings",
        "strict",
      ]),
    } as const;

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
      {
        id: "gemini",
        model: "gemini-1.5-flash",
        binaryPath: "/bin/gemini",
        argv: [
          "generate",
          "--model",
          "gemini-1.5-flash",
          "--prompt",
          "--output-format",
          "json",
          "--safety-settings",
          "strict",
        ],
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
      VORATIQ_AGENT_GEMINI_BINARY: "/bin/gemini",
    } as const;

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
      VORATIQ_AGENT_GEMINI_BINARY: "/bin/gemini",
      VORATIQ_AGENT_GEMINI_MODEL: "gemini-1.5-flash",
    } as const;

    expect(() => loadAgentCatalog({ env })).toThrow(/\{\{MODEL\}\}/u);
  });

  it("discovers the gemini binary via command -v when not provided", () => {
    execFileSyncMock.mockReturnValue("/usr/local/bin/gemini\n");

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
      VORATIQ_AGENT_GEMINI_MODEL: "gemini-1.5-flash",
    } as const;

    const catalog = loadAgentCatalog({ env });
    const geminiDefinition = catalog.find((agent) => agent.id === "gemini");

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(execFileSyncMock).toHaveBeenCalledWith("command", ["-v", "gemini"], {
      encoding: "utf8",
    });
    expect(geminiDefinition).toMatchObject({
      binaryPath: "/usr/local/bin/gemini",
    });
  });

  it("provides actionable messaging when gemini binary cannot be resolved", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("not found");
    });

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
      VORATIQ_AGENT_GEMINI_MODEL: "gemini-1.5-flash",
    } as const;

    expect(() => loadAgentCatalog({ env })).toThrow(/Gemini CLI binary/u);
  });
});
