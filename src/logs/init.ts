import { normalizePathForDisplay } from "../utils/fs.js";
import type { CreateWorkspaceResult } from "../workspace/index.js";

export interface InitSuccessOptions {
  result: CreateWorkspaceResult;
}

export function renderInitSuccess({ result }: InitSuccessOptions): string {
  if (
    result.createdDirectories.length === 0 &&
    result.createdFiles.length === 0
  ) {
    return "\nVoratiq workspace already exists.";
  }

  const lines: string[] = [];

  lines.push("\nVoratiq workspace created.");

  const directories = result.createdDirectories
    .map(normalizePathForDisplay)
    .sort()
    .map((directory) => `  - ${directory}/`);

  const files = result.createdFiles
    .map(normalizePathForDisplay)
    .sort()
    .map((file) => `  - ${file}`);

  lines.push(...directories, ...files);

  return lines.join("\n");
}
