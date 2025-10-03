import { renderRunSummary } from "../logs/index.js";
import { executeRunCommand } from "../run/command.js";
import { requireFlagValue } from "../utils/args.js";
import { ensureNonEmptyString } from "../utils/validators.js";
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

  const runReport = await executeRunCommand({
    root,
    runsDirectory: workspacePaths.runsDir,
    runsFilePath: workspacePaths.runsFile,
    specAbsolutePath,
    specDisplayPath,
    testCommand: options.testCommand,
    runId: options.runId,
  });

  const summaryOutput = renderRunSummary(runReport);

  process.stdout.write(`${summaryOutput}\n`);

  if (runReport.hadAgentFailure || runReport.hadTestFailure) {
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
        const result = requireFlagValue(args, index, "--spec");
        options.specPath = result.value;
        index = result.nextIndex;
        break;
      }
      case "--test-command": {
        const result = requireFlagValue(args, index, "--test-command");
        options.testCommand = result.value;
        index = result.nextIndex;
        break;
      }
      case "--id": {
        const result = requireFlagValue(args, index, "--id");
        options.runId = ensureNonEmptyString(
          result.value,
          "Expected value after --id",
        );
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
