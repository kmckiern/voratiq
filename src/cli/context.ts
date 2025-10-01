
import { assertGitRepository } from "../utils/git.js";
import {
  validateWorkspace,
  resolveWorkspacePath,
  VORATIQ_RUNS_DIR,
  VORATIQ_CONFIG_FILE,
  VORATIQ_RUNS_FILE,
} from "../workspace/index.js";

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

import { isAbsolute, resolve } from "node:path";
import { relativeToRoot, ensureFileExists } from "../utils/fs.js";
import { SpecNotFoundError } from "./errors.js";

export interface ResolvedSpecPath {
  absolutePath: string;
  displayPath: string;
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

import { RunRecord } from "../run/types.js";
import { RunNotFoundError } from "./errors.js";

export function ensureRunId(
  runId: string,
  runs: RunRecord[],
): RunRecord {
  const run = runs.find((r) => r.runId === runId);
  if (!run) {
    throw new RunNotFoundError(runId);
  }
  return run;
}
