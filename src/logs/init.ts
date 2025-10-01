import type { CreateWorkspaceResult } from "../workspace/index.js";

export interface InitSuccessOptions {
  result: CreateWorkspaceResult;
}

export function renderInitSuccess({ result }: InitSuccessOptions): string {
  const lines = ["Voratiq workspace ready."];

  if (result.createdDirectories.length > 0) {
    lines.push("  • Created directories:");
    for (const entry of result.createdDirectories) {
      lines.push(`      - ${entry}`);
    }
  }

  if (result.createdFiles.length > 0) {
    lines.push("  • Created files:");
    for (const entry of result.createdFiles) {
      lines.push(`      - ${entry}`);
    }
  }

  if (
    result.createdDirectories.length === 0 &&
    result.createdFiles.length === 0
  ) {
    lines.push("  • Existing workspace validated; no changes made.");
  }

  return lines.join("\n");
}
