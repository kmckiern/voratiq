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
    .map(normalizePath)
    .sort()
    .map((directory) => `  - ${directory}/`);

  const files = result.createdFiles
    .map(normalizePath)
    .sort()
    .map((file) => `  - ${file}`);

  lines.push(...directories, ...files);

  return lines.join("\n");
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return normalized.replace(/\/+$/u, "");
}
