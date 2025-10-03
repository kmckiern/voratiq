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

import { executeRunCommand } from "../../src/run/command.js";
import type { RunRecord } from "../../src/run/types.js";
import { createWorkspace } from "../../src/workspace/index.js";

const execFileAsync = promisify(execFile);

const AGENT_IDS = ["claude-code", "codex"] as const;

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
      setEnv(`${envPrefix}_ARGV`, JSON.stringify(["--prompt"]));
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

    const runResult = await executeRunCommand({
      root: repoRoot,
      runsDirectory: join(repoRoot, ".voratiq", "runs"),
      runsFilePath: join(repoRoot, ".voratiq", "runs.jsonl"),
      specAbsolutePath: specPath,
      specDisplayPath: relative(repoRoot, specPath),
      skipTests: false,
    });

    expect(runResult.agentOutcomes).toHaveLength(AGENT_IDS.length);
    for (const outcome of runResult.agentOutcomes) {
      const stdoutPath = join(repoRoot, ...outcome.artifacts.stdout.split("/"));
      const stderrPath = join(repoRoot, ...outcome.artifacts.stderr.split("/"));
      expect(outcome.status).toBe("succeeded");
      expect(outcome.diffAttempted).toBe(true);
      expect(outcome.diffCaptured).toBe(true);
      expect(outcome.tests.attempted).toBe(false);

      await expect(readFile(stdoutPath, "utf8")).resolves.toContain("stdout");
      await expect(readFile(stderrPath, "utf8")).resolves.toContain("stderr");

      const workspaceArtifact = join(
        repoRoot,
        ".voratiq",
        "runs",
        runResult.runId,
        outcome.agentId,
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
    expect(record?.runId).toBe(runResult.runId);
    expect(record?.rootPath).toBe(".");
    expect(record?.runPath).toBe(`.voratiq/runs/${runResult.runId}`);
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
      skipTests: true,
      runId: "custom-run-id",
    } as const;

    await executeRunCommand(sharedOptions);

    await expect(executeRunCommand(sharedOptions)).rejects.toThrow(
      /Run directory already exists/u,
    );
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

function buildAgentEnvPrefix(agentId: string): string {
  return `VORATIQ_AGENT_${agentId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}
