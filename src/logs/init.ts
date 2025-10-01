import type { CreateWorkspaceResult } from "../workspace/index.js";

export interface InitSuccessOptions {
  result: CreateWorkspaceResult;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function renderInitSuccess({ result }: InitSuccessOptions): string {
  const lines: string[] = [];

  return lines.join("\n");
}
