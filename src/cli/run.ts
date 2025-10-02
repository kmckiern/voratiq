import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { loadAgentCatalog } from "../agents/config.js";
import type { AgentDefinition } from "../agents/types.js";
import { renderRunSummary } from "../logs/index.js";
import type { AgentLogSummary } from "../logs/run.js";
import { generateRunId } from "../run/id.js";
import { buildAgentPrompt } from "../run/prompts.js";
import { appendRunRecord } from "../run/records.js";
import type {
  AgentInvocationRecord,
  AgentTestResult,
  RunRecord,
} from "../run/types.js";
import {
  createWorktree,
  getHeadRevision,
  gitAddAll,
  gitCommitAll,
  gitDiff,
  gitDiffShortStat,
  gitHasStagedChanges,
  runGitCommand,
} from "../utils/git.js";
import {
  normalizePathForDisplay,
  relativeToRoot,
  resolvePath,
} from "../utils/path.js";
import { ensureSpecPath, resolveCliContext } from "./preflight.js";

interface RunCliOptions {
  specPath: string;
  testCommand?: string;
  skipTests: boolean;
  runId?: string;
}

interface AgentExecutionOptions {
  agent: AgentDefinition;
  baseRevision: string;
  runId: string;
  root: string;
  runRoot: string;
  specDisplayPath: string;
  specContent: string;
  testCommand?: string;
  skipTests: boolean;
}

interface AgentExecutionResult {
  record: AgentInvocationRecord;
  log: AgentLogSummary;
  testsFailed: boolean;
}

export async function runRunCommand(args: string[]): Promise<void> {
  const options = parseRunArgs(args);

  const { root, workspacePaths } = await resolveCliContext();
  const { absolutePath: specAbsolutePath, displayPath: specDisplayPathRaw } =
    await ensureSpecPath(options.specPath, root);

  const specDisplayPath = normalizePathForDisplay(specDisplayPathRaw);
  const specContent = await readFile(specAbsolutePath, "utf8");
  const specHash = createHash("sha256").update(specContent).digest("hex");

  const runId = options.runId ?? generateRunId();
  const runRoot = resolvePath(workspacePaths.runsDir, runId);
  await mkdir(runRoot, { recursive: true });
  const runRootRelative = normalizePathForDisplay(
    relativeToRoot(root, runRoot),
  );

  const baseRevision = await getHeadRevision(root);
  const agents = loadAgentCatalog();

  const agentRecords: AgentInvocationRecord[] = [];
  const agentLogs: AgentLogSummary[] = [];
  let testsFailed = false;
  let agentFailed = false;

  for (const agent of agents) {
    const result = await executeAgent({
      agent,
      baseRevision,
      runId,
      root,
      runRoot,
      specDisplayPath,
      specContent,
      testCommand: options.testCommand,
      skipTests: options.skipTests,
    });
    agentRecords.push(result.record);
    agentLogs.push(result.log);
    testsFailed = testsFailed || result.testsFailed;
    agentFailed = agentFailed || result.record.status !== "succeeded";
  }

  const runRecord: RunRecord = {
    runId,
    spec: {
      path: specDisplayPath,
      sha256: specHash,
    },
    createdAt: new Date().toISOString(),
    baseRevision,
    rootPath: runRootRelative,
    agents: agentRecords,
  };

  await appendRunRecord(workspacePaths.runsFile, runRecord);

  const summaryOutput = renderRunSummary({
    specPath: specDisplayPath,
    runId,
    agentSummaries: agentLogs,
  });

  process.stdout.write(`${summaryOutput}\n`);

  if (agentFailed || testsFailed) {
    process.exitCode = 1;
  }
}

function parseRunArgs(args: string[]): RunCliOptions {
  const options: RunCliOptions = {
    specPath: "",
    skipTests: false,
  };

  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";

    if (arg === "--path") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Expected value after --path");
      }
      options.specPath = value;
      index += 2;
      continue;
    }

    if (arg.startsWith("--path=")) {
      options.specPath = arg.slice("--path=".length);
      index += 1;
      continue;
    }

    if (arg === "--test-command") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Expected value after --test-command");
      }
      options.testCommand = value;
      index += 2;
      continue;
    }

    if (arg.startsWith("--test-command=")) {
      options.testCommand = arg.slice("--test-command=".length);
      index += 1;
      continue;
    }

    if (arg === "--no-tests") {
      options.skipTests = true;
      index += 1;
      continue;
    }

    if (arg === "--id") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Expected value after --id");
      }
      options.runId = value;
      index += 2;
      continue;
    }

    if (arg.startsWith("--id=")) {
      options.runId = arg.slice("--id=".length);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.specPath) {
    throw new Error("Missing required --path <spec>");
  }

  return options;
}

async function executeAgent(
  options: AgentExecutionOptions,
): Promise<AgentExecutionResult> {
  const {
    agent,
    baseRevision,
    runId,
    root,
    runRoot,
    specDisplayPath,
    specContent,
    testCommand,
    skipTests,
  } = options;

  const agentRoot = resolvePath(runRoot, agent.id);
  const stdoutPath = resolvePath(agentRoot, "stdout.log");
  const stderrPath = resolvePath(agentRoot, "stderr.log");
  const diffPath = resolvePath(agentRoot, "diff.patch");
  const summaryPath = resolvePath(agentRoot, "summary.txt");
  const workspacePath = resolvePath(agentRoot, "workspace");
  const testsLogPath = resolvePath(agentRoot, "tests.log");

  await mkdir(agentRoot, { recursive: true });
  await writeFile(stdoutPath, "");
  await writeFile(stderrPath, "");
  await writeFile(diffPath, "");

  const branchName = `voratiq/run/${runId}/${agent.id}`;
  await createWorktree({
    root,
    worktreePath: workspacePath,
    branch: branchName,
    baseRevision,
  });

  const prompt = buildAgentPrompt({
    runId,
    agentId: agent.id,
    specPath: specDisplayPath,
    specContent,
  });

  const startedAt = new Date().toISOString();
  const agentExecution = await runAgentProcess({
    agent,
    cwd: workspacePath,
    prompt,
    stdoutPath,
    stderrPath,
  });
  const completedAt = new Date().toISOString();

  const stdoutRelative = normalizePathForDisplay(
    relativeToRoot(root, stdoutPath),
  );
  const stderrRelative = normalizePathForDisplay(
    relativeToRoot(root, stderrPath),
  );
  const workspaceRelative = normalizePathForDisplay(
    relativeToRoot(root, workspacePath),
  );

  let status: "succeeded" | "failed" =
    agentExecution.exitCode === 0 ? "succeeded" : "failed";

  let summaryText: string | undefined;
  let summaryRelative: string | undefined;
  let diffRelative: string | undefined;
  let changeSummary: string | undefined;
  let commitSha: string | undefined;

  if (status === "succeeded") {
    const summaryHarvest = await harvestSummary({
      workspacePath,
      summaryPath,
      root,
    });
    summaryText = summaryHarvest.summary;
    summaryRelative = summaryHarvest.relativePath;

    await gitAddAll(workspacePath);
    const hasChanges = await gitHasStagedChanges(workspacePath);

    if (hasChanges) {
      const message = summaryText
        ? summaryText.split("\n")[0]?.trim() ||
          fallbackCommitMessage(runId, agent.id)
        : fallbackCommitMessage(runId, agent.id);

      await gitCommitAll({
        cwd: workspacePath,
        message,
        authorName: "Voratiq Orchestrator",
        authorEmail: "cli@voratiq",
      });

      commitSha = await runGitCommand(["rev-parse", "HEAD"], {
        cwd: workspacePath,
      });

      const diffContent = await gitDiff({
        cwd: workspacePath,
        baseRevision,
        targetRevision: "HEAD",
      });
      await writeFile(diffPath, diffContent, { encoding: "utf8" });
      diffRelative = normalizePathForDisplay(relativeToRoot(root, diffPath));

      changeSummary = await gitDiffShortStat({
        cwd: workspacePath,
        baseRevision,
        targetRevision: "HEAD",
      });
    } else {
      commitSha = await runGitCommand(["rev-parse", "HEAD"], {
        cwd: workspacePath,
      });
    }
  }

  const attemptedTests =
    Boolean(testCommand) && !skipTests && status === "succeeded";

  const testsResult = await maybeRunTests({
    testCommand,
    cwd: workspacePath,
    testsLogPath,
    root,
    attemptedTests,
  });

  const logSummary: AgentLogSummary = {
    agentId: agent.id,
    status,
    changeSummary,
    attemptedDiff: true,
    capturedDiff: Boolean(diffRelative),
    attemptedTests,
    testsStatus: testsResult?.status,
    testsExitCode: testsResult?.exitCode ?? undefined,
    artifacts: {
      stdout: stdoutRelative,
      stderr: stderrRelative,
      diff: diffRelative,
      tests: testsResult?.logPath,
    },
  };

  const record: AgentInvocationRecord = {
    agentId: agent.id,
    model: agent.model,
    binaryPath: agent.binaryPath,
    argv: agent.argv,
    prompt,
    workspacePath: workspaceRelative,
    startedAt,
    completedAt,
    status,
    summary: summaryText,
    commit: commitSha,
    changeSummary,
    assets: {
      stdout: stdoutRelative,
      stderr: stderrRelative,
      workspace: workspaceRelative,
      diff: diffRelative,
      summary: summaryRelative,
      tests: testsResult?.logPath,
    },
    tests: testsResult,
    error:
      status === "failed"
        ? (agentExecution.errorMessage ?? "Agent exited with failure")
        : undefined,
  };

  return {
    record,
    log: logSummary,
    testsFailed: testsResult?.status === "failed",
  };
}

interface AgentProcessOptions {
  agent: AgentDefinition;
  cwd: string;
  prompt: string;
  stdoutPath: string;
  stderrPath: string;
}

interface AgentProcessResult {
  exitCode: number;
  errorMessage?: string;
}

async function runAgentProcess(
  options: AgentProcessOptions,
): Promise<AgentProcessResult> {
  const { agent, cwd, prompt, stdoutPath, stderrPath } = options;

  const stdoutStream = createWriteStream(stdoutPath, { flags: "w" });
  const stderrStream = createWriteStream(stderrPath, { flags: "w" });

  return new Promise<AgentProcessResult>((resolve, reject) => {
    const child = spawn(agent.binaryPath, agent.argv, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;

    if (!stdin || !stdout || !stderr) {
      stdoutStream.end();
      stderrStream.end();
      reject(new Error("Failed to capture agent process streams"));
      return;
    }

    stdout.pipe(stdoutStream);
    stderr.pipe(stderrStream);

    stdin.write(prompt);
    stdin.end();

    let errorMessage: string | undefined;

    child.on("error", (error: Error) => {
      errorMessage = error.message;
      stdoutStream.end();
      stderrStream.end();
      reject(error);
    });

    child.on("close", (code: number | null, signal: string | null) => {
      stdoutStream.end();
      stderrStream.end();

      if (signal) {
        errorMessage = `Agent terminated by signal ${signal}`;
      } else if (code && code !== 0) {
        errorMessage = `Agent exited with code ${code}`;
      }

      resolve({ exitCode: code ?? 0, errorMessage });
    });
  });
}

interface HarvestSummaryOptions {
  workspacePath: string;
  summaryPath: string;
  root: string;
}

interface HarvestSummaryResult {
  summary: string;
  relativePath: string;
}

async function harvestSummary(
  options: HarvestSummaryOptions,
): Promise<HarvestSummaryResult> {
  const { workspacePath, summaryPath, root } = options;
  const workspaceSummaryPath = resolvePath(workspacePath, ".summary.txt");
  const raw = await readFile(workspaceSummaryPath, "utf8").catch(() => {
    throw new Error("Agent did not produce .summary.txt");
  });

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Agent summary is empty");
  }

  await writeFile(summaryPath, `${trimmed}\n`, { encoding: "utf8" });
  await rm(workspaceSummaryPath, { force: true });

  return {
    summary: trimmed,
    relativePath: normalizePathForDisplay(relativeToRoot(root, summaryPath)),
  };
}

interface MaybeRunTestsOptions {
  testCommand?: string;
  cwd: string;
  testsLogPath: string;
  root: string;
  attemptedTests: boolean;
}

async function maybeRunTests(
  options: MaybeRunTestsOptions,
): Promise<AgentTestResult | undefined> {
  const { testCommand, cwd, testsLogPath, root, attemptedTests } = options;

  if (!attemptedTests || !testCommand) {
    return undefined;
  }

  const logStream = createWriteStream(testsLogPath, { flags: "w" });

  const result = await new Promise<AgentTestResult>((resolve, reject) => {
    const child = spawn(testCommand, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const stdout = child.stdout;
    const stderr = child.stderr;

    if (!stdout || !stderr) {
      logStream.end();
      reject(new Error("Failed to capture test process output"));
      return;
    }

    stdout.pipe(logStream, { end: false });
    stderr.pipe(logStream, { end: false });

    child.on("error", (error: Error) => {
      logStream.end();
      reject(error);
    });

    child.on("close", (code: number | null) => {
      logStream.end();
      const status = code === 0 ? "passed" : "failed";
      resolve({
        status,
        command: testCommand,
        exitCode: code ?? 0,
        logPath: normalizePathForDisplay(relativeToRoot(root, testsLogPath)),
      });
    });
  });

  return result;
}

function fallbackCommitMessage(runId: string, agentId: string): string {
  return `voratiq run ${runId} (${agentId})`;
}
