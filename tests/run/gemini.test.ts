import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { loadAgentCatalog } from "../../src/agents/config.js";
import { executeRunCommand } from "../../src/run/command.js";
import type { AgentInvocationRecord, RunRecord } from "../../src/run/types.js";
import { createWorkspace } from "../../src/workspace/index.js";

const execFileAsync = promisify(execFile);
function buildEnvPrefix(agentId: string): string {
  return `VORATIQ_AGENT_${agentId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

describe("Gemini agent integration", () => {
  let repoRoot: string;
  let agentScriptPath: string;
  const previousEnv = new Map<string, string | undefined>();

  function setEnv(key: string, value: string): void {
    if (!previousEnv.has(key)) {
      previousEnv.set(key, process.env[key]);
    }
    process.env[key] = value;
  }

  function restoreEnv(): void {
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    previousEnv.clear();
  }

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "voratiq-gemini-"));
    await initGitRepository(repoRoot);
    agentScriptPath = await createGeminiFixture(repoRoot);

    const agentIds: Array<"claude-code" | "codex" | "gemini"> = [
      "claude-code",
      "codex",
      "gemini",
    ];

    for (const agentId of agentIds) {
      const envPrefix = buildEnvPrefix(agentId);
      setEnv(`${envPrefix}_BINARY`, agentScriptPath);
      if (agentId === "gemini") {
        setEnv(`${envPrefix}_MODEL`, "gemini-runner-model");
      } else {
        setEnv(
          `${envPrefix}_ARGV`,
          JSON.stringify(["--prompt", "--model", "{{MODEL}}"]),
        );
        setEnv(`${envPrefix}_MODEL`, `${agentId}-model`);
      }
    }

    // Provide additional Gemini flags via the documented environment variable.
    setEnv(
      "VORATIQ_AGENT_GEMINI_ARGV",
      JSON.stringify(["--temperature", "0.3", "--log-level", "debug"]),
    );
    setEnv("CI", "1");
  });

  afterEach(async () => {
    restoreEnv();
    if (repoRoot) {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("runs Gemini alongside other agents and records artifacts", async () => {
    await createWorkspace(repoRoot);

    const specDir = join(repoRoot, "specs");
    await mkdir(specDir, { recursive: true });
    const specPath = join(specDir, "gemini.md");
    await writeFile(
      specPath,
      "# Gemini Integration\nEnsure Gemini agent artifacts are captured.\n",
      "utf8",
    );

    const catalog = loadAgentCatalog();
    expect(catalog.some((agent) => agent.id === "gemini")).toBe(true);

    const runReport = await executeRunCommand({
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
    });

    const geminiReport = runReport.agents.find(
      (agent) => agent.agentId === "gemini",
    );
    expect(geminiReport).toBeDefined();
    expect(geminiReport?.status).toBe("succeeded");
    expect(geminiReport?.assets.stdout).toContain("/gemini/stdout.log");
    expect(geminiReport?.assets.stderr).toContain("/gemini/stderr.log");
    expect(geminiReport?.assets.diff).toContain("/gemini/diff.patch");

    const runsLog = await readFile(
      join(repoRoot, ".voratiq", "runs.jsonl"),
      "utf8",
    );
    const lastRecord = runsLog
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as RunRecord)
      .at(-1);
    expect(lastRecord).toBeDefined();

    const geminiInvocation: AgentInvocationRecord | undefined =
      lastRecord?.agents.find((agent) => agent.agentId === "gemini");
    expect(geminiInvocation).toBeDefined();
    expect(geminiInvocation?.binaryPath).toBe(agentScriptPath);
    expect(geminiInvocation?.argv[0]).toBe("generate");
    expect(geminiInvocation?.argv).toContain("--output-format");
    expect(geminiInvocation?.argv).toContain("gemini-runner-model");
    expect(geminiInvocation?.argv).toContain("--temperature");
    expect(geminiInvocation?.argv).toContain("--log-level");
    expect(geminiInvocation?.argv).toContain("debug");
    expect(geminiInvocation?.summary).toContain("gemini agent summary");
  });
});

async function initGitRepository(root: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "ci@example.com"], {
    cwd: root,
  });
  await execFileAsync("git", ["config", "user.name", "Voratiq Test"], {
    cwd: root,
  });

  const readmePath = join(root, "README.md");
  await writeFile(readmePath, "# Gemini Fixture Repo\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: root });
}

async function createGeminiFixture(root: string): Promise<string> {
  const scriptPath = join(root, "gemini-agent.js");
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workspace = process.cwd();
const marker = process.env.VORATIQ_AGENT_ID || 'unknown-agent';
const content = 'gemini agent summary for ' + marker;
fs.writeFileSync(path.join(workspace, '.summary.txt'), content, 'utf8');
fs.writeFileSync(path.join(workspace, 'artifact.txt'), content, 'utf8');
console.log('stdout from ' + marker);
console.error('stderr from ' + marker);
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}
