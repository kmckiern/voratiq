import { isAbsolute, resolve } from "node:path";
import { RunRecord } from "../run/types.js";
import { ensureFileExists, relativeToRoot } from "../utils/fs.js";
import { assertGitRepository } from "../utils/git.js";
import {
  resolveWorkspacePath,
  validateWorkspace,
  VORATIQ_CONFIG_FILE,
  VORATIQ_RUNS_DIR,
  VORATIQ_RUNS_FILE,
} from "../workspace/index.js";
import { RunNotFoundError, SpecNotFoundError } from "./errors.js";

export interface WorkspacePaths {
  root: string;
  workspaceDir: string;
  runsDir: string;
  configFile: string;
  runsFile: string;
}

export interface CliContext {
  root: string;
  workspacePaths: WorkspacePaths;
}

export interface ResolveCliContextOptions {
  requireWorkspace?: boolean;
}

export async function resolveCliContext(
  options: ResolveCliContextOptions = {},
): Promise<CliContext> {
  const { requireWorkspace = true } = options;
  const root = process.cwd();

  await assertGitRepository(root);

  if (requireWorkspace) {
    await validateWorkspace(root);
  }

  const workspaceDir = resolveWorkspacePath(root);
  const workspacePaths: WorkspacePaths = {
    root,
    workspaceDir,
    runsDir: resolveWorkspacePath(root, VORATIQ_RUNS_DIR),
    configFile: resolveWorkspacePath(root, VORATIQ_CONFIG_FILE),
    runsFile: resolveWorkspacePath(root, VORATIQ_RUNS_FILE),
  };

  return { root, workspacePaths };
}

export async function ensureSpecPath(
  specPath: string,
  root: string,
): Promise<ResolvedSpecPath> {
  const absolutePath = isAbsolute(specPath)
    ? specPath
    : resolve(root, specPath);
  const displayPath = relativeToRoot(root, absolutePath);

  await ensureFileExists(
    absolutePath,
    () => new SpecNotFoundError(displayPath),
  );

  return { absolutePath, displayPath };
}

export function ensureRunId(runId: string, runs: RunRecord[]): RunRecord {
  const run = runs.find((r) => r.runId === runId);
  if (!run) {
    throw new RunNotFoundError(runId);
  }
  return run;
}
