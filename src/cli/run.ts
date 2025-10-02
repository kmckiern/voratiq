import { renderRunSummary } from "../logs/index.js";
import type { AgentLogSummary } from "../logs/run.js";
import type { AgentOutcome } from "../run/command.js";
import { executeRunCommand } from "../run/command.js";
import { ensureSpecPath, resolveCliContext } from "./preflight.js";

interface RunCliOptions {
  specPath: string;
  testCommand?: string;
  skipTests: boolean;
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
    skipTests: options.skipTests,
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
    skipTests: false,
  };

  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";

    switch (arg) {
      case "--path": {
        const value = args[index + 1];
        if (!value) {
          throw new Error("Expected value after --path");
        }
        options.specPath = value;
        index += 2;
        break;
      }
      case "--test-command": {
        const value = args[index + 1];
        if (!value) {
          throw new Error("Expected value after --test-command");
        }
        options.testCommand = value;
        index += 2;
        break;
      }
      case "--no-tests": {
        options.skipTests = true;
        index += 1;
        break;
      }
      case "--id": {
        const value = args[index + 1];
        if (!value) {
          throw new Error("Expected value after --id");
        }
        options.runId = value;
        index += 2;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.specPath) {
    throw new Error("Missing required --path <spec>");
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
