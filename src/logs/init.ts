import type { CreateWorkspaceResult } from "../workspace/index.js";

export interface InitSuccessOptions {
  result: CreateWorkspaceResult;
}

export function renderInitSuccess({ result }: InitSuccessOptions): string {
  const lines: string[] = [];

  return lines.join("\n");
}
