import { mkdir, readFile, writeFile } from "node:fs/promises";

import { voratiqConfigSchema } from "../cli/types.js";
import {
  ensureDirectoryExists,
  ensureFileExists,
  pathExists,
  relativeToRoot,
  resolvePath,
} from "../utils/path.js";

export const VORATIQ_DIR = ".voratiq";
export const VORATIQ_RUNS_DIR = "runs";
export const VORATIQ_CONFIG_FILE = "config.json";
export const VORATIQ_RUNS_FILE = "runs.jsonl";

export interface CreateWorkspaceResult {
  createdDirectories: string[];
  createdFiles: string[];
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export class WorkspaceMissingEntryError extends WorkspaceError {
  constructor(public readonly entryPath: string) {
    super(`Missing workspace entry: ${entryPath}`);
    this.name = "WorkspaceMissingEntryError";
  }
}

export class WorkspaceInvalidConfigError extends WorkspaceError {
  constructor(
    public readonly filePath: string,
    public readonly details: string,
  ) {
    super(`Invalid workspace config at ${filePath}: ${details}`);
    this.name = "WorkspaceInvalidConfigError";
  }
}

export function resolveWorkspacePath(
  root: string,
  ...segments: string[]
): string {
  return resolvePath(root, VORATIQ_DIR, ...segments);
}

export async function createWorkspace(
  root: string,
): Promise<CreateWorkspaceResult> {
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];

  const workspaceDir = resolveWorkspacePath(root);
  if (!(await pathExists(workspaceDir))) {
    await mkdir(workspaceDir, { recursive: true });
    createdDirectories.push(relativeToRoot(root, workspaceDir));
  }

  const runsDir = resolveWorkspacePath(root, VORATIQ_RUNS_DIR);
  if (!(await pathExists(runsDir))) {
    await mkdir(runsDir, { recursive: true });
    createdDirectories.push(relativeToRoot(root, runsDir));
  }

  const configPath = resolveWorkspacePath(root, VORATIQ_CONFIG_FILE);
  if (!(await pathExists(configPath))) {
    await writeFile(configPath, `${JSON.stringify({}, null, 2)}\n`, {
      encoding: "utf8",
    });
    createdFiles.push(relativeToRoot(root, configPath));
  }

  const runsIndexPath = resolveWorkspacePath(root, VORATIQ_RUNS_FILE);
  if (!(await pathExists(runsIndexPath))) {
    await writeFile(runsIndexPath, "", { encoding: "utf8" });
    createdFiles.push(relativeToRoot(root, runsIndexPath));
  }

  return { createdDirectories, createdFiles };
}

export async function validateWorkspace(root: string): Promise<void> {
  const workspaceDir = resolveWorkspacePath(root);
  await ensureDirectoryExists(
    workspaceDir,
    () => new WorkspaceMissingEntryError(relativeToRoot(root, workspaceDir)),
  );

  const runsDir = resolveWorkspacePath(root, VORATIQ_RUNS_DIR);
  await ensureDirectoryExists(
    runsDir,
    () => new WorkspaceMissingEntryError(relativeToRoot(root, runsDir)),
  );

  const configPath = resolveWorkspacePath(root, VORATIQ_CONFIG_FILE);
  await ensureFileExists(
    configPath,
    () => new WorkspaceMissingEntryError(relativeToRoot(root, configPath)),
  );

  const configRaw = await readFile(configPath, "utf8");
  let configJson: unknown;
  try {
    configJson = configRaw.trim().length === 0 ? {} : JSON.parse(configRaw);
  } catch (error) {
    throw new WorkspaceInvalidConfigError(
      relativeToRoot(root, configPath),
      (error as Error).message,
    );
  }

  const parseResult = voratiqConfigSchema.safeParse(configJson);
  if (!parseResult.success) {
    throw new WorkspaceInvalidConfigError(
      relativeToRoot(root, configPath),
      parseResult.error.issues.map((issue) => issue.message).join(", "),
    );
  }

  const runsIndexPath = resolveWorkspacePath(root, VORATIQ_RUNS_FILE);
  await ensureFileExists(
    runsIndexPath,
    () => new WorkspaceMissingEntryError(relativeToRoot(root, runsIndexPath)),
  );
}
