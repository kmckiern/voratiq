import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { loadAgentCatalog } from "../agents/config.js";
import type { AgentDefinition, AgentId } from "../agents/types.js";
import { ensureNonEmptyString } from "../utils/args.js";
import { pathExists } from "../utils/fs.js";
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
import {
  AgentProcessError,
  GitOperationError,
  RunCommandError,
  SummaryMissingError,
  TestCommandError,
  WorkspaceSetupError,
} from "./errors.js";
import { generateRunId } from "./id.js";
import { buildAgentPrompt } from "./prompts.js";
import { appendRunRecord } from "./records.js";
import {
  agentTestResultSchema,
  type AgentInvocationRecord,
  type AgentReport,
  type AgentTestResult,
  type RunRecord,
  type RunReport,
} from "./types.js";

const STDOUT_FILENAME = "stdout.log" as const;
const STDERR_FILENAME = "stderr.log" as const;
const DIFF_FILENAME = "diff.patch" as const;
const SUMMARY_FILENAME = "summary.txt" as const;
const WORKSPACE_DIRNAME = "workspace" as const;
const TESTS_FILENAME = "tests.log" as const;
const WORKSPACE_SUMMARY_FILENAME = ".summary.txt" as const;
const PROMPT_FLAG_PREFIXES = ["--prompt=", "-p="] as const;
const PROMPT_FLAG_TOKENS = new Set(["--prompt", "-p"]);

export interface RunCommandInput {
  root: string;
  runsDirectory: string;
  runsFilePath: string;
  specAbsolutePath: string;
  specDisplayPath: string;
  testCommand?: string;
  runId?: string;
}

interface AgentExecutionContext {
  agent: AgentDefinition;
  baseRevision: string;
  runId: string;
  root: string;
  runRoot: string;
  specContent: string;
  testCommand?: string;
}

interface AgentExecutionState {
  diffAttempted: boolean;
  diffCaptured: boolean;
  testsAttempted: boolean;
}

interface AgentExecutionResult {
  record: AgentInvocationRecord;
  report: AgentReport;
}

interface AgentWorkspacePaths {
  agentRoot: string;
  stdoutPath: string;
  stderrPath: string;
  diffPath: string;
  summaryPath: string;
  workspacePath: string;
  testsLogPath: string;
  stdoutRelative: string;
  stderrRelative: string;
  diffRelativePath: string;
  workspaceRelative: string;
  testsLogRelativePath: string;
}

interface ArtifactCollectionResult {
  summaryText: string;
  summaryRelative: string;
  diffRelative?: string;
  changeSummary?: string;
  commitSha?: string;
  diffAttempted: boolean;
  diffCaptured: boolean;
}

export async function executeRunCommand(
  input: RunCommandInput,
): Promise<RunReport> {
  const {
    root,
    runsDirectory,
    runsFilePath,
    specAbsolutePath,
    specDisplayPath,
    testCommand,
    runId: explicitRunId,
  } = input;

  if (testCommand !== undefined) {
    ensureNonEmptyString(
      testCommand,
      "Test command cannot be empty or whitespace",
    );
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
  const agentReports: AgentReport[] = [];

  for (const agent of agents) {
    const execution = await executeAgent({
      agent,
      baseRevision,
      runId,
      root,
      runRoot,
      specContent,
      testCommand,
    });

    agentRecords.push(execution.record);
    agentReports.push(execution.report);
  }

  const hadAgentFailure = agentReports.some(
    (report) => report.status === "failed",
  );
  const hadTestFailure = agentReports.some(
    (report) =>
      report.testsAttempted &&
      (report.tests?.status === "failed" || Boolean(report.tests?.error)),
  );

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

  const runReport = toRunReport(
    runRecord,
    agentReports,
    hadAgentFailure,
    hadTestFailure,
  );

  return runReport;
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
    testCommand,
  } = context;

  const workspacePaths = buildAgentWorkspacePaths({
    root,
    runRoot,
    agentId: agent.id,
  });
  const prompt = buildAgentPrompt({ specContent });
  const agentArgv = buildAgentArgv(agent.argv, prompt);
  const startedAt = new Date().toISOString();
  const agentContext = new AgentRunContext({
    agent,
    agentArgv,
    prompt,
    startedAt,
    workspacePaths,
  });

  try {
    await prepareAgentWorkspace({
      paths: workspacePaths,
      baseRevision,
      root,
      agentId: agent.id,
      runId,
    });
    await agentContext.recordWorkspaceBaseline();
  } catch (error) {
    const failure =
      error instanceof RunCommandError ? error : ensureWorkspaceError(error);
    return await agentContext.failWith(failure);
  }

  try {
    const processResult = await runAgentProcess({
      agent,
      argv: agentArgv,
      cwd: workspacePaths.workspacePath,
      prompt,
      stdoutPath: workspacePaths.stdoutPath,
      stderrPath: workspacePaths.stderrPath,
    });

    if (processResult.exitCode !== 0 || processResult.errorMessage) {
      const workspaceModified = await hasWorkspaceModifications(
        workspacePaths.workspacePath,
      );
      const failure = new AgentProcessError({
        phase: workspaceModified ? "afterOutput" : "beforeOutput",
        exitCode: processResult.exitCode,
        detail: processResult.errorMessage,
      });
      agentContext.markFailure(failure);
    }
  } catch (rawError) {
    const failure =
      rawError instanceof RunCommandError
        ? rawError
        : new AgentProcessError({
            phase: "beforeOutput",
            detail:
              rawError instanceof Error ? rawError.message : String(rawError),
          });
    agentContext.markFailure(failure);
  }

  if (agentContext.isFailed()) {
    agentContext.setCompleted();
    return await agentContext.finalize();
  }

  try {
    const artifacts = await collectAgentArtifacts({
      baseRevision,
      workspacePath: workspacePaths.workspacePath,
      summaryPath: workspacePaths.summaryPath,
      diffPath: workspacePaths.diffPath,
      diffRelativePath: workspacePaths.diffRelativePath,
      root,
    });

    agentContext.applyArtifacts(artifacts);
  } catch (rawError) {
    const failure = classifyPostProcessError(rawError);
    return await agentContext.failWith(failure);
  }

  if (testCommand) {
    const testExecution = await executeAgentTests({
      testCommand,
      cwd: workspacePaths.workspacePath,
      testsLogPath: workspacePaths.testsLogPath,
      root,
      testsLogRelativePath: workspacePaths.testsLogRelativePath,
    });

    agentContext.applyTests(testExecution);
  }

  agentContext.setCompleted();
  return await agentContext.finalize();
}

interface BuildAgentRecordOptions {
  agent: AgentDefinition;
  agentArgv: string[];
  changeSummary: string | undefined;
  commitSha: string | undefined;
  completedAt: string;
  diffRelative: string | undefined;
  errorMessage: string | undefined;
  prompt: string;
  startedAt: string;
  status: "succeeded" | "failed";
  stdoutRelative: string;
  stderrRelative: string;
  summaryRelative: string | undefined;
  testsResult: AgentTestResult | undefined;
  workspaceRelative: string;
  summaryText: string | undefined;
}

function buildAgentRecord(
  options: BuildAgentRecordOptions,
): AgentInvocationRecord {
  const {
    agent,
    agentArgv,
    changeSummary,
    commitSha,
    completedAt,
    diffRelative,
    errorMessage,
    prompt,
    startedAt,
    status,
    stdoutRelative,
    stderrRelative,
    summaryRelative,
    testsResult,
    workspaceRelative,
    summaryText,
  } = options;

  return {
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
      tests: testsResult?.logPath,
    },
    tests: testsResult,
    error: errorMessage,
  };
}

function finalizeAgentResult(
  record: AgentInvocationRecord,
  derivations: AgentExecutionState,
): AgentExecutionResult {
  const report = toAgentReport(record, {
    diffAttempted: derivations.diffAttempted,
    diffCaptured: derivations.diffCaptured,
    testsAttempted: derivations.testsAttempted,
  });
  return { record, report };
}

async function scaffoldAgentWorkspace(options: {
  agentRoot: string;
  stdoutPath: string;
  stderrPath: string;
  diffPath: string;
  summaryPath: string;
  testsLogPath: string;
  workspacePath: string;
}): Promise<void> {
  const {
    agentRoot,
    stdoutPath,
    stderrPath,
    diffPath,
    summaryPath,
    testsLogPath,
    workspacePath,
  } = options;

  try {
    await mkdir(agentRoot, { recursive: true });
    await writeFile(stdoutPath, "", { encoding: "utf8" });
    await writeFile(stderrPath, "", { encoding: "utf8" });
    await writeFile(diffPath, "", { encoding: "utf8" });
    await writeFile(testsLogPath, "", { encoding: "utf8" });
    await mkdir(workspacePath, { recursive: true });
    await writeFile(summaryPath, "", { encoding: "utf8" });
  } catch (error) {
    throw ensureWorkspaceError(error);
  }
}

async function runGitStep<T>(
  operationMessage: string,
  step: () => Promise<T>,
): Promise<T> {
  try {
    return await step();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new GitOperationError({ operation: operationMessage, detail });
  }
}

function classifyPostProcessError(error: unknown): RunCommandError {
  if (error instanceof RunCommandError) {
    return error;
  }

  if (error instanceof Error && error.message?.includes(".summary.txt")) {
    return new SummaryMissingError();
  }

  if (error instanceof Error) {
    return new GitOperationError({
      operation: "Run finalization failed",
      detail: error.message,
    });
  }

  return new GitOperationError({
    operation: "Run finalization failed",
    detail: String(error),
  });
}

async function hasWorkspaceModifications(
  workspacePath: string,
): Promise<boolean> {
  try {
    const status = await runGitCommand(["status", "--porcelain"], {
      cwd: workspacePath,
      trim: true,
    });
    return status.length > 0;
  } catch (error) {
    throw new GitOperationError({
      operation: "Git status failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

interface RunTestsOptions {
  testCommand: string;
  cwd: string;
  testsLogPath: string;
  root: string;
}

async function runTests(options: RunTestsOptions): Promise<AgentTestResult> {
  const { testCommand, cwd, testsLogPath, root } = options;
  const logStream = createWriteStream(testsLogPath, { flags: "w" });

  try {
    const result = await new Promise<AgentTestResult>((resolve, reject) => {
      const child = spawn(testCommand, {
        cwd,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      const { stdout, stderr } = child;

      if (!stdout || !stderr) {
        reject(
          new TestCommandError({ detail: "Failed to capture test output" }),
        );
        return;
      }

      stdout.pipe(logStream, { end: false });
      stderr.pipe(logStream, { end: false });

      child.on("error", (error: Error) => {
        reject(new TestCommandError({ detail: error.message }));
      });

      child.on("close", (code: number | null) => {
        logStream.end();
        const status = code === 0 ? "passed" : "failed";
        resolve(
          agentTestResultSchema.parse({
            status,
            command: testCommand,
            exitCode: code ?? 0,
            logPath: normalizePathForDisplay(
              relativeToRoot(root, testsLogPath),
            ),
          }),
        );
      });
    });

    return result;
  } catch (error) {
    logStream.end();
    if (error instanceof TestCommandError) {
      throw error;
    }
    throw new TestCommandError({
      detail: error instanceof Error ? error.message : String(error),
    });
  }
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
      env: {
        ...process.env,
        VORATIQ_AGENT_ID: agent.id,
        VORATIQ_AGENT_MODEL: agent.model,
      },
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

  let raw: string;
  try {
    raw = await readFile(workspaceSummaryPath, "utf8");
  } catch (error) {
    throw new SummaryMissingError(
      error instanceof Error ? error.message : String(error),
    );
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SummaryMissingError("Agent summary is empty");
  }

  await writeFile(summaryPath, `${trimmed}\n`, { encoding: "utf8" });
  await rm(workspaceSummaryPath, { force: true });

  return {
    summary: trimmed,
    relativePath: normalizePathForDisplay(relativeToRoot(root, summaryPath)),
  };
}

function ensureWorkspaceError(error: unknown): WorkspaceSetupError {
  const detail = error instanceof Error ? error.message : String(error);
  return new WorkspaceSetupError({ detail });
}

function buildAgentWorkspacePaths(options: {
  root: string;
  runRoot: string;
  agentId: AgentId;
}): AgentWorkspacePaths {
  const { root, runRoot, agentId } = options;

  const agentRoot = resolvePath(runRoot, agentId);
  const stdoutPath = resolvePath(agentRoot, STDOUT_FILENAME);
  const stderrPath = resolvePath(agentRoot, STDERR_FILENAME);
  const diffPath = resolvePath(agentRoot, DIFF_FILENAME);
  const summaryPath = resolvePath(agentRoot, SUMMARY_FILENAME);
  const workspacePath = resolvePath(agentRoot, WORKSPACE_DIRNAME);
  const testsLogPath = resolvePath(agentRoot, TESTS_FILENAME);

  return {
    agentRoot,
    stdoutPath,
    stderrPath,
    diffPath,
    summaryPath,
    workspacePath,
    testsLogPath,
    stdoutRelative: normalizePathForDisplay(relativeToRoot(root, stdoutPath)),
    stderrRelative: normalizePathForDisplay(relativeToRoot(root, stderrPath)),
    diffRelativePath: normalizePathForDisplay(relativeToRoot(root, diffPath)),
    workspaceRelative: normalizePathForDisplay(
      relativeToRoot(root, workspacePath),
    ),
    testsLogRelativePath: normalizePathForDisplay(
      relativeToRoot(root, testsLogPath),
    ),
  };
}

async function prepareAgentWorkspace(options: {
  paths: AgentWorkspacePaths;
  baseRevision: string;
  root: string;
  agentId: AgentId;
  runId: string;
}): Promise<void> {
  const { paths, baseRevision, root, agentId, runId } = options;

  try {
    await scaffoldAgentWorkspace({
      agentRoot: paths.agentRoot,
      stdoutPath: paths.stdoutPath,
      stderrPath: paths.stderrPath,
      diffPath: paths.diffPath,
      summaryPath: paths.summaryPath,
      testsLogPath: paths.testsLogPath,
      workspacePath: paths.workspacePath,
    });
  } catch (error) {
    throw ensureWorkspaceError(error);
  }

  try {
    await createWorktree({
      root,
      worktreePath: paths.workspacePath,
      branch: `voratiq/run/${runId}/${agentId}`,
      baseRevision,
    });
  } catch (error) {
    throw ensureWorkspaceError(error);
  }
}

async function collectAgentArtifacts(options: {
  baseRevision: string;
  workspacePath: string;
  summaryPath: string;
  diffPath: string;
  diffRelativePath: string;
  root: string;
}): Promise<ArtifactCollectionResult> {
  const {
    baseRevision,
    workspacePath,
    summaryPath,
    diffPath,
    diffRelativePath,
    root,
  } = options;

  const summaryHarvest = await harvestSummary({
    workspacePath,
    summaryPath,
    root,
  });

  await runGitStep("Git add failed", () => gitAddAll(workspacePath));
  const hasChanges = await gitHasStagedChanges(workspacePath);

  let diffRelative: string | undefined;
  let changeSummary: string | undefined;
  let commitSha: string | undefined;

  if (hasChanges) {
    const summaryLine = summaryHarvest.summary.split("\n")[0]?.trim() ?? "";
    if (!summaryLine) {
      throw new SummaryMissingError("Agent summary is missing a subject line");
    }

    await runGitStep("Git commit failed", () =>
      gitCommitAll({
        cwd: workspacePath,
        message: summaryLine,
        authorName: "Voratiq Orchestrator",
        authorEmail: "cli@voratiq",
      }),
    );

    commitSha = await runGitStep("Git rev-parse failed", () =>
      runGitCommand(["rev-parse", "HEAD"], { cwd: workspacePath }),
    );

    const diffContent = await runGitStep("Git diff failed", () =>
      gitDiff({
        cwd: workspacePath,
        baseRevision,
        targetRevision: "HEAD",
      }),
    );
    await writeFile(diffPath, diffContent, { encoding: "utf8" });
    diffRelative = diffRelativePath;

    changeSummary = await runGitStep("Git diff --shortstat failed", () =>
      gitDiffShortStat({
        cwd: workspacePath,
        baseRevision,
        targetRevision: "HEAD",
      }),
    );
  }

  return {
    summaryText: summaryHarvest.summary,
    summaryRelative: summaryHarvest.relativePath,
    diffRelative,
    changeSummary,
    commitSha,
    diffAttempted: true,
    diffCaptured: Boolean(diffRelative),
  };
}

async function executeAgentTests(options: {
  testCommand: string;
  cwd: string;
  testsLogPath: string;
  root: string;
  testsLogRelativePath: string;
}): Promise<AgentTestExecutionResult> {
  const { testCommand, cwd, testsLogPath, root, testsLogRelativePath } =
    options;

  try {
    const result = await runTests({
      testCommand,
      cwd,
      testsLogPath,
      root,
    });
    return { attempted: true, result };
  } catch (rawError) {
    const failure =
      rawError instanceof TestCommandError
        ? rawError
        : new TestCommandError({
            detail:
              rawError instanceof Error ? rawError.message : String(rawError),
          });

    const result = agentTestResultSchema.parse({
      status: "skipped",
      command: testCommand,
      logPath: testsLogRelativePath,
      error: failure.messageForDisplay(),
    });

    return {
      attempted: true,
      result,
      errorMessage: failure.messageForDisplay(),
    };
  }
}

interface AgentTestExecutionResult {
  attempted: boolean;
  result?: AgentTestResult;
  errorMessage?: string;
}

class AgentRunContext {
  public readonly state: AgentExecutionState = {
    diffAttempted: false,
    diffCaptured: false,
    testsAttempted: false,
  };

  public status: "succeeded" | "failed" = "succeeded";
  public changeSummary: string | undefined;
  public commitSha: string | undefined;
  public summaryText: string | undefined;
  public summaryRelative: string | undefined;
  public diffRelative: string | undefined;
  public testsResult: AgentTestResult | undefined;
  public errorMessage: string | undefined;
  private completedAt: string | undefined;
  private workspaceCleanAtStart = false;
  private workspaceModifiedOnFailure: boolean | undefined;
  private workspaceAnnotationApplied = false;

  constructor(
    private readonly params: {
      agent: AgentDefinition;
      agentArgv: string[];
      prompt: string;
      startedAt: string;
      workspacePaths: AgentWorkspacePaths;
    },
  ) {}

  public markFailure(error: RunCommandError): void {
    this.status = "failed";
    this.errorMessage = error.messageForDisplay();
  }

  public async failWith(error: RunCommandError): Promise<AgentExecutionResult> {
    this.markFailure(error);
    this.setCompleted();
    return await this.finalize();
  }

  public isFailed(): boolean {
    return this.status === "failed";
  }

  public setCompleted(): void {
    if (!this.completedAt) {
      this.completedAt = new Date().toISOString();
    }
  }

  public applyArtifacts(result: ArtifactCollectionResult): void {
    this.summaryText = result.summaryText;
    this.summaryRelative = result.summaryRelative;
    this.diffRelative = result.diffRelative;
    this.changeSummary = result.changeSummary;
    this.commitSha = result.commitSha;
    this.state.diffAttempted ||= result.diffAttempted;
    this.state.diffCaptured ||= result.diffCaptured;
  }

  public applyTests(result: AgentTestExecutionResult): void {
    this.state.testsAttempted ||= result.attempted;
    if (result.result) {
      this.testsResult = result.result;
    }
    if (result.errorMessage) {
      this.errorMessage = result.errorMessage;
    }
  }

  public async recordWorkspaceBaseline(): Promise<void> {
    try {
      this.workspaceCleanAtStart = !(await hasWorkspaceModifications(
        this.params.workspacePaths.workspacePath,
      ));
    } catch (error) {
      throw ensureWorkspaceError(error);
    }
  }

  public async finalize(): Promise<AgentExecutionResult> {
    this.setCompleted();

    if (this.isFailed() && !this.workspaceAnnotationApplied) {
      // Only the orchestrator knows whether the workspace stayed clean or
      // picked up edits. Annotate the error message here so the underlying
      // error classes remain focused on what failed, and this layer adds
      // the state context reviewers care about.
      await this.updateWorkspaceFailureState();
      if (this.errorMessage) {
        this.errorMessage = annotateWorkspaceFailureMessage(this.errorMessage, {
          workspaceCleanAtStart: this.workspaceCleanAtStart,
          workspaceModifiedOnFailure: this.workspaceModifiedOnFailure,
        });
        this.workspaceAnnotationApplied = true;
      }
    }

    const { agent, agentArgv, prompt, startedAt, workspacePaths } = this.params;
    const record = buildAgentRecord({
      agent,
      agentArgv,
      changeSummary: this.changeSummary,
      commitSha: this.commitSha,
      completedAt: this.completedAt ?? new Date().toISOString(),
      diffRelative: this.diffRelative,
      errorMessage: this.errorMessage,
      prompt,
      startedAt,
      status: this.status,
      stdoutRelative: workspacePaths.stdoutRelative,
      stderrRelative: workspacePaths.stderrRelative,
      summaryRelative: this.summaryRelative,
      testsResult: this.testsResult,
      workspaceRelative: workspacePaths.workspaceRelative,
      summaryText: this.summaryText,
    });

    return finalizeAgentResult(record, this.state);
  }

  private async updateWorkspaceFailureState(): Promise<void> {
    try {
      this.workspaceModifiedOnFailure = await hasWorkspaceModifications(
        this.params.workspacePaths.workspacePath,
      );
    } catch {
      this.workspaceModifiedOnFailure = undefined;
    }
  }
}

function toAgentReport(
  record: AgentInvocationRecord,
  derivations: {
    diffAttempted: boolean;
    diffCaptured: boolean;
    testsAttempted: boolean;
  },
): AgentReport {
  return {
    agentId: record.agentId,
    status: record.status,
    changeSummary: record.changeSummary,
    assets: record.assets,
    tests: record.tests,
    error: record.error,
    diffAttempted: derivations.diffAttempted,
    diffCaptured: derivations.diffCaptured,
    testsAttempted: derivations.testsAttempted,
  };
}

function toRunReport(
  record: RunRecord,
  agents: AgentReport[],
  hadAgentFailure: boolean,
  hadTestFailure: boolean,
): RunReport {
  const derivedAgentFailure = agents.some((agent) => agent.status === "failed");
  const derivedTestFailure = agents.some(
    (agent) =>
      agent.testsAttempted &&
      (agent.tests?.status === "failed" || Boolean(agent.tests?.error)),
  );

  if (hadAgentFailure !== derivedAgentFailure) {
    throw new Error(
      `RunReport mismatch: hadAgentFailure (${hadAgentFailure}) does not match derived value (${derivedAgentFailure}).`,
    );
  }

  if (hadTestFailure !== derivedTestFailure) {
    throw new Error(
      `RunReport mismatch: hadTestFailure (${hadTestFailure}) does not match derived value (${derivedTestFailure}).`,
    );
  }

  return {
    runId: record.runId,
    spec: record.spec,
    agents,
    hadAgentFailure: derivedAgentFailure,
    hadTestFailure: derivedTestFailure,
  };
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

function annotateWorkspaceFailureMessage(
  message: string,
  options: {
    workspaceCleanAtStart: boolean;
    workspaceModifiedOnFailure: boolean | undefined;
  },
): string {
  if (!message) {
    return message;
  }

  if (options.workspaceModifiedOnFailure === true) {
    return `${message}; workspace contains uncommitted edits (inspect artifacts)`;
  }

  if (
    options.workspaceModifiedOnFailure === false &&
    options.workspaceCleanAtStart
  ) {
    return `${message}; workspace remained unchanged`;
  }

  return message;
}

export { toAgentReport, toRunReport };
