
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export class SpecNotFoundError extends CliError {
  constructor(public readonly specPath: string) {
    super(`Spec file not found: ${specPath}`);
    this.name = "SpecNotFoundError";
  }
}

export class RunNotFoundError extends CliError {
  constructor(public readonly runId: string) {
    super(`Run not found: ${runId}`);
    this.name = "RunNotFoundError";
  }
}
