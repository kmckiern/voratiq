import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { loadAgentCatalog } from "../agents/config.js";
import type { AgentDefinition } from "../agents/types.js";
import type { AgentId } from "../agents/types.js";
import type {
  AgentInvocationRecord,
  AgentTestResult,
  RunRecord,
} from "./types.js";
import { agentTestResultSchema } from "./types.js";
import { appendRunRecord } from "./records.js";
import { buildAgentPrompt } from "./prompts.js";
import { generateRunId } from "./id.js";
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
import { pathExists } from "../utils/fs.js";

const STDOUT_FILENAME = "stdout.log" as const;
const STDERR_FILENAME = "stderr.log" as const;
const DIFF_FILENAME = "diff.patch" as const;
const SUMMARY_FILENAME = "summary.txt" as const;
const WORKSPACE_DIRNAME = "workspace" as const;
const TESTS_FILENAME = "tests.log" as const;
const WORKSPACE_SUMMARY_FILENAME = ".summary.txt" as const;
const PROMPT_FLAG_PREFIXES = ["--prompt=", "-p="] as const;
const PROMPT_FLAG_TOKENS = new Set(["--prompt", "-p"]);

export interface RunExecutionOptions {
  root: string;
  runsDirectory: string;
  runsFilePath: string;
  specAbsolutePath: string;
  specDisplayPath: string;
  skipTests: boolean;
  testCommand?: string;
  runId?: string;
}

export interface RunExecutionResult {
  runId: string;
  specDisplayPath: string;
  agentOutcomes: AgentOutcome[];
  hadAgentFailure: boolean;
  hadTestFailure: boolean;
}

export interface AgentOutcome {
  agentId: AgentId;
  status: "succeeded" | "failed";
  changeSummary?: string;
  diffAttempted: boolean;
  diffCaptured: boolean;
  tests: AgentOutcomeTests;
  artifacts: AgentOutcomeArtifacts;
}

export interface AgentOutcomeArtifacts {
  stdout: string;
  stderr: string;
  diff?: string;
  tests?: string;
}

export interface AgentOutcomeTests {
  attempted: boolean;
  status?: "passed" | "failed";
  exitCode?: number | null;
  logPath?: string;
}

interface AgentExecutionContext {
  agent: AgentDefinition;
  baseRevision: string;
  runId: string;
  root: string;
  runRoot: string;
  specContent: string;
  skipTests: boolean;
  testCommand?: string;
}

interface AgentExecutionResult {
  record: AgentInvocationRecord;
  outcome: AgentOutcome;
  testsFailed: boolean;
}

export async function executeRunCommand(
  options: RunExecutionOptions,
): Promise<RunExecutionResult> {
  const {
    root,
    runsDirectory,
    runsFilePath,
    specAbsolutePath,
    specDisplayPath,
    skipTests,
    testCommand,
    runId: explicitRunId,
  } = options;

  if (testCommand !== undefined && testCommand.trim().length === 0) {
    throw new Error("Test command cannot be empty or whitespace");
  }

  const specContent = await readFile(specAbsolutePath, "utf8");
  const specHash = createHash("sha256").update(specContent).digest("hex");

  const runId = explicitRunId ?? generateRunId();
  const runRoot = resolvePath(runsDirectory, runId);
  if (await pathExists(runRoot)) {
    const displayPath = normalizePathForDisplay(relativeToRoot(root, runRoot));
    throw new Error(
      `Run directory already exists for id ${runId}: ${displayPath}`,
    );
  }
  await mkdir(runRoot, { recursive: true });

  const baseRevision = await getHeadRevision(root);
  const agents = loadAgentCatalog();

  const agentRecords: AgentInvocationRecord[] = [];
  const agentOutcomes: AgentOutcome[] = [];
  let hadAgentFailure = false;
  let hadTestFailure = false;

  for (const agent of agents) {
    const execution = await executeAgent({
      agent,
      baseRevision,
      runId,
      root,
      runRoot,
      specContent,
      skipTests,
      testCommand,
    });

    agentRecords.push(execution.record);
    agentOutcomes.push(execution.outcome);
    hadAgentFailure ||= execution.record.status !== "succeeded";
    hadTestFailure ||= execution.testsFailed;
  }

  const repoDisplayPath = normalizePathForDisplay(relativeToRoot(root, root));
  const runDirectoryDisplayPath = normalizePathForDisplay(
    relativeToRoot(root, runRoot),
  );

  const runRecord: RunRecord = {
    runId,
    spec: {
      path: normalizePathForDisplay(specDisplayPath),
      sha256: specHash,
    },
    createdAt: new Date().toISOString(),
    baseRevision,
    rootPath: repoDisplayPath,
    runPath: runDirectoryDisplayPath,
    agents: agentRecords,
  };

  await appendRunRecord(runsFilePath, runRecord);

  return {
    runId,
    specDisplayPath: normalizePathForDisplay(specDisplayPath),
    agentOutcomes,
    hadAgentFailure,
    hadTestFailure,
  };
}

async function executeAgent(
  context: AgentExecutionContext,
): Promise<AgentExecutionResult> {
  const {
    agent,
    baseRevision,
    runId,
    root,
    runRoot,
    specContent,
    skipTests,
    testCommand,
  } = context;

  const agentRoot = resolvePath(runRoot, agent.id);
  const stdoutPath = resolvePath(agentRoot, STDOUT_FILENAME);
  const stderrPath = resolvePath(agentRoot, STDERR_FILENAME);
  const diffPath = resolvePath(agentRoot, DIFF_FILENAME);
  const summaryPath = resolvePath(agentRoot, SUMMARY_FILENAME);
  const workspacePath = resolvePath(agentRoot, WORKSPACE_DIRNAME);
  const testsLogPath = resolvePath(agentRoot, TESTS_FILENAME);

  await mkdir(agentRoot, { recursive: true });
  await writeFile(stdoutPath, "", { encoding: "utf8" });
  await writeFile(stderrPath, "", { encoding: "utf8" });
  await writeFile(diffPath, "", { encoding: "utf8" });
  await writeFile(testsLogPath, "", { encoding: "utf8" });

  const branchName = `voratiq/run/${runId}/${agent.id}`;
  await createWorktree({
    root,
    worktreePath: workspacePath,
    branch: branchName,
    baseRevision,
  });

  const prompt = buildAgentPrompt({ specContent });
  const agentArgv = buildAgentArgv(agent.argv, prompt);

  const startedAt = new Date().toISOString();
  const processResult = await runAgentProcess({
    agent,
    argv: agentArgv,
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

  const status: "succeeded" | "failed" =
    processResult.exitCode === 0 ? "succeeded" : "failed";

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
      const summaryLine = summaryText.split("\n")[0]?.trim() ?? "";
      if (!summaryLine) {
        throw new Error("Agent summary is missing a subject line");
      }

      await gitCommitAll({
        cwd: workspacePath,
        message: summaryLine,
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

  let testsFailed = false;
  let testsLogRelative: string | undefined;
  let normalizedTestStatus: "passed" | "failed" | undefined;
  if (testsResult) {
    if (testsResult.status === "passed" || testsResult.status === "failed") {
      normalizedTestStatus = testsResult.status;
    }
    testsFailed = normalizedTestStatus === "failed";
    testsLogRelative = testsResult.logPath;
  }

  const outcome: AgentOutcome = {
    agentId: agent.id,
    status,
    changeSummary,
    diffAttempted: true,
    diffCaptured: Boolean(diffRelative),
    tests: {
      attempted: attemptedTests,
      status: normalizedTestStatus,
      exitCode: testsResult?.exitCode,
      logPath: testsLogRelative,
    },
    artifacts: {
      stdout: stdoutRelative,
      stderr: stderrRelative,
      diff: diffRelative,
      tests: testsLogRelative,
    },
  };

  const record: AgentInvocationRecord = {
    agentId: agent.id,
    model: agent.model,
    binaryPath: agent.binaryPath,
    argv: agentArgv,
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
      tests: testsLogRelative,
    },
    tests: testsResult,
    error:
      status === "failed"
        ? (processResult.errorMessage ?? "Agent exited with failure")
        : undefined,
  };

  return {
    record,
    outcome,
    testsFailed,
  };
}

interface AgentProcessOptions {
  agent: AgentDefinition;
  argv: string[];
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
  const { agent, argv, cwd, prompt, stdoutPath, stderrPath } = options;

  const stdoutStream = createWriteStream(stdoutPath, { flags: "w" });
  const stderrStream = createWriteStream(stderrPath, { flags: "w" });

  return new Promise<AgentProcessResult>((resolve, reject) => {
    const child = spawn(agent.binaryPath, argv, {
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
      } else if (typeof code === "number" && code !== 0) {
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
  const workspaceSummaryPath = resolvePath(
    workspacePath,
    WORKSPACE_SUMMARY_FILENAME,
  );
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
      resolve(
        agentTestResultSchema.parse({
          status,
          command: testCommand,
          exitCode: code ?? 0,
          logPath: normalizePathForDisplay(relativeToRoot(root, testsLogPath)),
        }),
      );
    });
  });

  return result;
}

function buildAgentArgv(
  originalArgv: readonly string[],
  prompt: string,
): string[] {
  const argv = [...originalArgv];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    const matchedPrefix = PROMPT_FLAG_PREFIXES.find((prefix) =>
      token.startsWith(prefix),
    );
    if (matchedPrefix) {
      argv[index] = `${matchedPrefix}${prompt}`;
      return argv;
    }

    if (PROMPT_FLAG_TOKENS.has(token)) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        argv.splice(index + 1, 0, prompt);
      } else {
        argv[index + 1] = prompt;
      }
      return argv;
    }
  }

  return [...argv, prompt];
}
