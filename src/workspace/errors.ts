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
