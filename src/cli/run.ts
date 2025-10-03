import { renderRunSummary } from "../logs/index.js";
import type { AgentLogSummary } from "../logs/run.js";
import type { AgentOutcome } from "../run/command.js";
import { executeRunCommand } from "../run/command.js";
import { ensureSpecPath, resolveCliContext } from "./preflight.js";

interface RunCliOptions {
  specPath: string;
  testCommand?: string;
  runId?: string;
}

export async function runRunCommand(args: string[]): Promise<void> {
  const options = parseRunArgs(args);
  const { root, workspacePaths } = await resolveCliContext();

  const { absolutePath: specAbsolutePath, displayPath: specDisplayPath } =
    await ensureSpecPath(options.specPath, root);

  const runResult = await executeRunCommand({
    root,
    runsDirectory: workspacePaths.runsDir,
    runsFilePath: workspacePaths.runsFile,
    specAbsolutePath,
    specDisplayPath,
    testCommand: options.testCommand,
    runId: options.runId,
  });

  const summaryOutput = renderRunSummary({
    specPath: runResult.specDisplayPath,
    runId: runResult.runId,
    agentSummaries: runResult.agentOutcomes.map(mapOutcomeToLogSummary),
  });

  process.stdout.write(`${summaryOutput}\n`);

  if (runResult.hadAgentFailure || runResult.hadTestFailure) {
    process.exitCode = 1;
  }
}

function parseRunArgs(args: string[]): RunCliOptions {
  const options: RunCliOptions = {
    specPath: "",
  };

  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";

    switch (arg) {
      case "--spec": {
        const result = expectRequiredValue(args, index, "--spec");
        options.specPath = result.value;
        index = result.nextIndex;
        break;
      }
      case "--test-command": {
        const result = expectRequiredValue(args, index, "--test-command");
        options.testCommand = result.value;
        index = result.nextIndex;
        break;
      }
      case "--id": {
        const result = expectRequiredValue(args, index, "--id");
        options.runId = result.value;
        index = result.nextIndex;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.specPath) {
    throw new Error("Missing required --spec <spec>");
  }

  return options;
}

function mapOutcomeToLogSummary(outcome: AgentOutcome): AgentLogSummary {
  return {
    agentId: outcome.agentId,
    status: outcome.status,
    changeSummary: outcome.changeSummary,
    attemptedDiff: outcome.diffAttempted,
    capturedDiff: outcome.diffCaptured,
    attemptedTests: outcome.tests.attempted,
    testsStatus: outcome.tests.status,
    testsExitCode: outcome.tests.exitCode ?? undefined,
    artifacts: outcome.artifacts,
  };
}

interface FlagValueResult {
  value: string;
  nextIndex: number;
}

function expectRequiredValue(
  args: string[],
  index: number,
  flag: string,
): FlagValueResult {
  const value = args[index + 1];
  if (!value || value.trim().length === 0) {
    throw new Error(`Expected value after ${flag}`);
  }

  return { value, nextIndex: index + 2 };
}
