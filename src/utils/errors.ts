export class GitRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitRepositoryError";
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
