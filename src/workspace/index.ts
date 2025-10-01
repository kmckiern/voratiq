import { mkdir, readFile, writeFile } from "node:fs/promises";

import { voratiqConfigSchema } from "../cli/types.js";
import {
  ensureDirectoryExists,
  ensureFileExists,
  pathExists,
} from "../utils/fs.js";
import { relativeToRoot, resolvePath } from "../utils/path.js";
import {
  WorkspaceInvalidConfigError,
  WorkspaceMissingEntryError,
} from "./errors.js";

export const VORATIQ_DIR = ".voratiq";
export const VORATIQ_RUNS_DIR = "runs";
export const VORATIQ_CONFIG_FILE = "config.json";
export const VORATIQ_RUNS_FILE = "runs.jsonl";

export interface CreateWorkspaceResult {
  createdDirectories: string[];
  createdFiles: string[];
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
  await readAndValidateConfig(root, configPath);

  const runsIndexPath = resolveWorkspacePath(root, VORATIQ_RUNS_FILE);
  await ensureFileExists(
    runsIndexPath,
    () => new WorkspaceMissingEntryError(relativeToRoot(root, runsIndexPath)),
  );
}

async function readAndValidateConfig(
  root: string,
  configPath: string,
): Promise<void> {
  const displayPath = relativeToRoot(root, configPath);
  const raw = await readFile(configPath, "utf8");

  if (raw.trim().length === 0) {
    throw new WorkspaceInvalidConfigError(displayPath, "config.json is empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new WorkspaceInvalidConfigError(
      displayPath,
      (error as Error).message,
    );
  }

  const result = voratiqConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new WorkspaceInvalidConfigError(
      displayPath,
      result.error.issues.map((issue) => issue.message).join(", "),
    );
  }
}
