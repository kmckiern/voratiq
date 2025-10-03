export type RunErrorKind =
  | "workspace-setup"
  | "agent-process"
  | "summary-missing"
  | "git-operation"
  | "test-command";

export abstract class RunCommandError extends Error {
  public abstract readonly kind: RunErrorKind;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }

  public abstract messageForDisplay(): string;
}

export interface WorkspaceSetupErrorOptions {
  detail: string;
}

export class WorkspaceSetupError extends RunCommandError {
  public readonly kind = "workspace-setup" as const;

  constructor(private readonly options: WorkspaceSetupErrorOptions) {
    super(options.detail);
  }

  public override messageForDisplay(): string {
    return this.options.detail;
  }
}

export type AgentProcessFailurePhase = "beforeOutput" | "afterOutput";

export interface AgentProcessErrorOptions {
  phase: AgentProcessFailurePhase;
  exitCode?: number | null;
  detail?: string;
}

export class AgentProcessError extends RunCommandError {
  public readonly kind = "agent-process" as const;
  private readonly phase: AgentProcessFailurePhase;
  private readonly exitCode?: number | null;
  private readonly detail?: string;

  constructor(options: AgentProcessErrorOptions) {
    const { phase, exitCode, detail } = options;
    const suffix =
      typeof exitCode === "number" ? ` (exit code ${exitCode})` : "";
    const message =
      phase === "beforeOutput"
        ? "Agent exited before modifying the workspace"
        : `Agent process failed after editing the workspace${suffix}`;
    super(detail ? `${message}: ${detail}` : message);
    this.phase = phase;
    this.exitCode = exitCode;
    this.detail = detail;
  }

  public override messageForDisplay(): string {
    if (this.phase === "beforeOutput") {
      return "Agent exited before modifying the workspace";
    }

    const suffix =
      typeof this.exitCode === "number" ? ` (exit code ${this.exitCode})` : "";
    return `Agent process failed after editing the workspace${suffix}`;
  }
}

export class SummaryMissingError extends RunCommandError {
  public readonly kind = "summary-missing" as const;

  constructor(message = "Agent did not produce .summary.txt") {
    super(message);
  }

  public override messageForDisplay(): string {
    return "Agent did not produce .summary.txt";
  }
}

export interface GitOperationErrorOptions {
  operation: string;
  detail: string;
}

export class GitOperationError extends RunCommandError {
  public readonly kind = "git-operation" as const;
  private readonly operation: string;
  private readonly detail: string;

  constructor(options: GitOperationErrorOptions) {
    const { operation, detail } = options;
    super(`${operation}: ${detail}`);
    this.operation = operation;
    this.detail = detail;
  }

  public override messageForDisplay(): string {
    return `${this.operation}: ${this.detail}`;
  }
}

export interface TestCommandErrorOptions {
  detail: string;
}

export class TestCommandError extends RunCommandError {
  public readonly kind = "test-command" as const;
  private readonly detail: string;

  constructor(options: TestCommandErrorOptions) {
    const { detail } = options;
    super(`Tests command failed to start: ${detail}`);
    this.detail = detail;
  }

  public override messageForDisplay(): string {
    return `Tests command failed to start: ${this.detail}`;
  }
}
