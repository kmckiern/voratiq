import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  writeFile,
  mkdir,
  chmod,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { runRunCommand } from "../../src/cli/run.js";
import { renderRunSummary } from "../../src/logs/run.js";
import { executeRunCommand } from "../../src/run/command.js";
import type { RunRecord } from "../../src/run/types.js";
import { createWorkspace } from "../../src/workspace/index.js";

const execFileAsync = promisify(execFile);

const AGENT_IDS = ["claude-code", "codex"] as const;
const projectRoot = process.cwd();

describe("voratiq run (integration)", () => {
  let repoRoot: string;
  let agentScriptPath: string;
  let previousEnvValues: Map<string, string | undefined>;

  function setEnv(key: string, value: string): void {
    if (!previousEnvValues.has(key)) {
      previousEnvValues.set(key, process.env[key]);
    }
    process.env[key] = value;
  }

  beforeEach(async () => {
    previousEnvValues = new Map();
    repoRoot = await mkdtemp(join(tmpdir(), "voratiq-run-"));
    await initGitRepository(repoRoot);
    agentScriptPath = await createAgentScript(repoRoot);

    for (const agentId of AGENT_IDS) {
      const envPrefix = buildAgentEnvPrefix(agentId);
      setEnv(`${envPrefix}_BINARY`, agentScriptPath);
      setEnv(
        `${envPrefix}_ARGV`,
        JSON.stringify(["--prompt", "--model", "{{MODEL}}"]),
      );
      setEnv(`${envPrefix}_MODEL`, `${agentId}-test-model`);
    }
  });

  afterEach(async () => {
    for (const [key, value] of previousEnvValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("executes configured agents and records run artifacts", async () => {
    await createWorkspace(repoRoot);

    const specPath = join(repoRoot, "specs", "sample.md");
    await mkdir(join(repoRoot, "specs"), { recursive: true });
    await writeFile(
      specPath,
      "# Sample Spec\nUpdate artifact with greeting.\n",
      "utf8",
    );

    const runReport = await executeRunCommand({
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
    });

    expect(runReport.agents).toHaveLength(AGENT_IDS.length);
    for (const agent of runReport.agents) {
      const stdoutPath = join(repoRoot, ...agent.assets.stdout.split("/"));
      const stderrPath = join(repoRoot, ...agent.assets.stderr.split("/"));
      expect(agent.status).toBe("succeeded");
      expect(agent.diffAttempted).toBe(true);
      expect(agent.diffCaptured).toBe(true);
      expect(agent.testsAttempted).toBe(false);
      expect(agent.tests).toBeUndefined();

      await expect(readFile(stdoutPath, "utf8")).resolves.toContain("stdout");
      await expect(readFile(stderrPath, "utf8")).resolves.toContain("stderr");

      const workspaceArtifact = join(
        repoRoot,
        ".voratiq",
        "runs",
        runReport.runId,
        agent.agentId,
        "workspace",
        "artifact.txt",
      );
      const artifactContent = await readFile(workspaceArtifact, "utf8");
      expect(artifactContent).toContain(
        "Implement the following specification:",
      );
    }

    const runsLog = await readFile(
      join(repoRoot, ".voratiq", "runs.jsonl"),
      "utf8",
    );
    const records = runsLog
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as RunRecord);
    const record = records.at(-1);
    expect(record).toBeDefined();
    expect(record?.runId).toBe(runReport.runId);
    expect(record?.rootPath).toBe(".");
    expect(record?.runPath).toBe(`.voratiq/runs/${runReport.runId}`);
  });

  it("continues after agent failure and matches design output", async () => {
    await createWorkspace(repoRoot);

    const failingScriptPath = await createFailingAgentScript(repoRoot);
    const failingEnvPrefix = buildAgentEnvPrefix("codex");
    setEnv(`${failingEnvPrefix}_BINARY`, failingScriptPath);

    const specRelativePath = "tests/fixtures/run/hello-world.md";
    const specPath = join(repoRoot, specRelativePath);
    await mkdir(join(repoRoot, "tests", "fixtures", "run"), {
      recursive: true,
    });
    await writeFile(
      specPath,
      "# Hello World\nDemonstrate partial agent failure tolerance.\n",
      "utf8",
    );

    const testCommandPath = await createPassingTestCommand(repoRoot);

    const originalCwd = process.cwd();
    const originalExitCode = process.exitCode;
    const originalWrite: typeof process.stdout.write =
      process.stdout.write.bind(process.stdout);
    const captured: string[] = [];

    process.chdir(repoRoot);
    (process.stdout.write as unknown) = ((chunk: unknown) => {
      if (typeof chunk === "string") {
        captured.push(chunk);
      } else if (Buffer.isBuffer(chunk)) {
        captured.push(chunk.toString("utf8"));
      } else {
        captured.push(String(chunk));
      }
      return true;
    }) as typeof process.stdout.write;

    try {
      await runRunCommand([
        "--spec",
        specRelativePath,
        "--test-command",
        testCommandPath,
      ]);
    } finally {
      process.stdout.write = originalWrite;
      process.chdir(originalCwd);
    }

    const output = captured.join("");
    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;

    const trimmedOutput = output.trimEnd();
    const runIdMatch = trimmedOutput.match(/Run ID: ([^\n]+)/u);
    expect(runIdMatch).not.toBeNull();
    const runId = runIdMatch?.[1] ?? "";

    const designTemplate = await readFile(
      join(projectRoot, "design", "cli-output", "run-failed-agent.out"),
      "utf8",
    );
    const expectedSummary = extractDesignSummary(designTemplate).replaceAll(
      "20251003-052332-ikneb",
      runId,
    );
    const normalizedActual = normalizeChangesLines(trimmedOutput);
    const normalizedExpected = normalizeChangesLines(expectedSummary);
    expect(normalizedActual).toBe(normalizedExpected);

    const runsLog = await readFile(
      join(repoRoot, ".voratiq", "runs.jsonl"),
      "utf8",
    );
    const records = runsLog
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as RunRecord);
    const finalRecord = records.at(-1);
    expect(finalRecord?.agents).toHaveLength(AGENT_IDS.length);
    const failingRecord = finalRecord?.agents.find(
      (agent) => agent.agentId === "codex",
    );
    expect(failingRecord?.status).toBe("failed");
    expect(failingRecord?.error).toBe("Agent failed to modify the workspace");
  });

  it("surfaces summary violations with clear messaging", async () => {
    await createWorkspace(repoRoot);

    const summarylessScriptPath = await createSummarylessAgentScript(repoRoot);
    const failingEnvPrefix = buildAgentEnvPrefix("codex");
    setEnv(`${failingEnvPrefix}_BINARY`, summarylessScriptPath);

    const specPath = join(repoRoot, "specs", "missing-summary.md");
    await mkdir(join(repoRoot, "specs"), { recursive: true });
    await writeFile(specPath, "# Missing summary\nDo nothing.\n", "utf8");

    const runReport = await executeRunCommand({
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
    });

    const summarylessAgent = runReport.agents.find(
      (agent) => agent.agentId === "codex",
    );
    expect(summarylessAgent).toBeDefined();
    expect(summarylessAgent?.status).toBe("failed");
    expect(summarylessAgent?.error).toBe(
      "Agent modified the workspace but did not produce .summary.txt (inspect artifacts)",
    );
    expect(summarylessAgent?.diffAttempted).toBe(false);

    const summaryOutput = renderRunSummary(runReport);
    expect(summaryOutput).toContain(
      "Agent modified the workspace but did not produce .summary.txt (inspect artifacts)",
    );
  });

  it("marks signal-terminated agents as failures", async () => {
    await createWorkspace(repoRoot);

    const signalScriptPath = await createSignalTerminatingAgentScript(repoRoot);
    const envPrefix = buildAgentEnvPrefix("codex");
    setEnv(`${envPrefix}_BINARY`, signalScriptPath);

    const specPath = join(repoRoot, "specs", "signal.md");
    await mkdir(join(repoRoot, "specs"), { recursive: true });
    await writeFile(specPath, "# Signal\nTest signal termination.\n", "utf8");

    const runReport = await executeRunCommand({
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
    });

    const signalAgent = runReport.agents.find(
      (agent) => agent.agentId === "codex",
    );
    expect(signalAgent).toBeDefined();
    expect(signalAgent?.status).toBe("failed");
    expect(signalAgent?.error).toBe("Agent failed to modify the workspace");
  });

  it("surfaces git status failures from the failure classifier", async () => {
    await createWorkspace(repoRoot);

    const gitBreakerScript = await createGitBreakingAgentScript(repoRoot);
    const envPrefix = buildAgentEnvPrefix("codex");
    setEnv(`${envPrefix}_BINARY`, gitBreakerScript);

    const specPath = join(repoRoot, "specs", "git-breaker.md");
    await mkdir(join(repoRoot, "specs"), { recursive: true });
    await writeFile(specPath, "# Git breaker\n", "utf8");

    const runReport = await executeRunCommand({
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
    });

    const gitFailureAgent = runReport.agents.find(
      (agent) => agent.agentId === "codex",
    );
    expect(gitFailureAgent).toBeDefined();
    expect(gitFailureAgent?.status).toBe("failed");
    expect(gitFailureAgent?.error).toContain("Git status failed");
  });

  it("refuses to reuse an explicit run id", async () => {
    await createWorkspace(repoRoot);

    const specPath = join(repoRoot, "specs", "guard.md");
    await mkdir(join(repoRoot, "specs"), { recursive: true });
    await writeFile(specPath, "Guard run id reuse\n", "utf8");

    const sharedOptions = {
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
      runId: "custom-run-id",
    } as const;

    await executeRunCommand(sharedOptions);

    await expect(executeRunCommand(sharedOptions)).rejects.toThrow(
      /Run directory already exists/u,
    );
  });

  it("rejects an empty test command", async () => {
    await createWorkspace(repoRoot);

    const specPath = join(repoRoot, "specs", "blank-test.md");
    await mkdir(join(repoRoot, "specs"), { recursive: true });
    await writeFile(specPath, "Reject empty test command\n", "utf8");

    await expect(
      executeRunCommand({
        root: repoRoot,
        runsDirectory: join(repoRoot, ".voratiq", "runs"),
        runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
        specAbsolutePath: specPath,
        specDisplayPath: relative(repoRoot, specPath),
        testCommand: "   ",
      }),
    ).rejects.toThrow(/Test command cannot be empty or whitespace/u);
  });
});

async function initGitRepository(root: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "cli@example.com"], {
    cwd: root,
  });
  await execFileAsync("git", ["config", "user.name", "Voratiq CLI"], {
    cwd: root,
  });

  const readmePath = join(root, "README.md");
  await writeFile(readmePath, "# Voratiq Test Repo\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: root });
}

async function createAgentScript(root: string): Promise<string> {
  const scriptPath = join(root, "fake-agent.js");
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function extractPrompt(argv) {
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.startsWith('--prompt=')) {
      return arg.slice('--prompt='.length);
    }
    if (typeof arg === 'string' && arg.startsWith('-p=')) {
      return arg.slice(3);
    }
  }

  const promptIndex = argv.findIndex((value) => value === '--prompt' || value === '-p');
  if (promptIndex >= 0 && typeof argv[promptIndex + 1] === 'string') {
    return argv[promptIndex + 1];
  }
  return '';
}

const prompt = extractPrompt(process.argv.slice(2));
if (!prompt) {
  console.error('Missing prompt argument');
  process.exit(1);
}

const workspace = process.cwd();
const firstLine = prompt.split('\\n')[0] || '';
fs.writeFileSync(path.join(workspace, 'artifact.txt'), firstLine + '\\n', 'utf8');
fs.writeFileSync(path.join(workspace, '.summary.txt'), 'Implemented spec changes.', 'utf8');

console.log('stdout log');
console.error('stderr log');
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createFailingAgentScript(root: string): Promise<string> {
  const scriptPath = join(root, "failing-agent.js");
  const script = `#!/usr/bin/env node
console.error('simulated agent failure');
process.exit(1);
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createSummarylessAgentScript(root: string): Promise<string> {
  const scriptPath = join(root, "summaryless-agent.js");
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workspace = process.cwd();
fs.writeFileSync(path.join(workspace, 'artifact.txt'), 'no summary', 'utf8');
console.log('stdout log');
console.error('stderr log');
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createPassingTestCommand(root: string): Promise<string> {
  const scriptPath = join(root, "pass-tests.sh");
  const script = `#!/usr/bin/env bash
echo "tests passed"
exit 0
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createSignalTerminatingAgentScript(
  root: string,
): Promise<string> {
  const scriptPath = join(root, "signal-agent.js");
  const script = `#!/usr/bin/env node
process.kill(process.pid, 'SIGTERM');
setTimeout(() => {}, 1000);
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createGitBreakingAgentScript(root: string): Promise<string> {
  const scriptPath = join(root, "git-breaker-agent.js");
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const workspace = process.cwd();
try {
  const gitFile = path.join(workspace, '.git');
  const contents = fs.readFileSync(gitFile, 'utf8');
  const parts = contents.split(/gitdir:/i);
  const gitDirPath = parts[1] ? parts[1].trim() : undefined;
  if (gitDirPath) {
    fs.rmSync(gitDirPath, { recursive: true, force: true });
  }
  fs.rmSync(gitFile, { force: true });
  fs.writeFileSync(gitFile, 'gitdir: /nonexistent/gitdir', 'utf8');
} catch (error) {
  console.error('failed to remove git metadata', error);
}

console.error('breaking git status and exiting');
process.exit(1);
`;

  await writeFile(scriptPath, script, { encoding: "utf8" });
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

function extractDesignSummary(template: string): string {
  const lines = template.trim().split(/\r?\n/u);
  if (lines[0] === "```") {
    lines.shift();
  }
  if (lines.at(-1) === "```") {
    lines.pop();
  }

  // Drop the command invocation line if present.
  if (lines[0]?.startsWith("$ voratiq run")) {
    lines.shift();
  }

  if (lines[0] === "") {
    lines.shift();
  }

  const joined = lines.join("\n");
  return `\n${joined}`;
}

function buildAgentEnvPrefix(agentId: string): string {
  return `VORATIQ_AGENT_${agentId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function normalizeChangesLines(value: string): string {
  return value.replace(/(\s+- Changes: ).+/gu, "$1<normalized>");
}
