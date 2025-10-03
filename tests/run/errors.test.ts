import {
  AgentProcessError,
  GitOperationError,
  SummaryMissingError,
  TestCommandError,
  WorkspaceSetupError,
} from "../../src/run/errors.js";

describe("run errors", () => {
  it("formats workspace setup errors", () => {
    const error = new WorkspaceSetupError({
      detail: "Failed to create directory",
    });
    expect(error.messageForDisplay()).toBe("Failed to create directory");
  });

  it("formats agent process errors before output", () => {
    const error = new AgentProcessError({ phase: "beforeOutput" });
    expect(error.messageForDisplay()).toBe(
      "Agent exited before modifying the workspace",
    );
  });

  it("formats agent process errors after output with exit code", () => {
    const error = new AgentProcessError({ phase: "afterOutput", exitCode: 9 });
    expect(error.messageForDisplay()).toBe(
      "Agent process failed after editing the workspace (exit code 9)",
    );
  });

  it("formats summary missing errors", () => {
    const error = new SummaryMissingError();
    expect(error.messageForDisplay()).toBe(
      "Agent did not produce .summary.txt",
    );
  });

  it("formats git operation errors", () => {
    const error = new GitOperationError({
      operation: "Git commit failed",
      detail: "exit status 1",
    });
    expect(error.messageForDisplay()).toBe("Git commit failed: exit status 1");
  });

  it("formats test command errors", () => {
    const error = new TestCommandError({ detail: "ENOENT" });
    expect(error.messageForDisplay()).toBe(
      "Tests command failed to start: ENOENT",
    );
  });
});
