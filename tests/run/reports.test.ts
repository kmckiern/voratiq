import { toAgentReport, toRunReport } from "../../src/run/command.js";
import type {
  AgentInvocationRecord,
  AgentReport,
  RunRecord,
} from "../../src/run/types.js";

describe("report mapping helpers", () => {
  const baseAgentRecord: AgentInvocationRecord = {
    agentId: "claude-code",
    model: "claude-model",
    binaryPath: "/bin/claude",
    argv: ["--prompt=hello"],
    prompt: "hello",
    workspacePath: ".voratiq/runs/123/claude-code/workspace",
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(0).toISOString(),
    status: "succeeded",
    summary: "Implemented spec",
    commit: "abc123",
    changeSummary: "1 file changed",
    assets: {
      stdout: ".voratiq/runs/123/claude-code/stdout.log",
      stderr: ".voratiq/runs/123/claude-code/stderr.log",
      workspace: ".voratiq/runs/123/claude-code/workspace",
      diff: ".voratiq/runs/123/claude-code/diff.patch",
      summary: ".voratiq/runs/123/claude-code/summary.txt",
      tests: ".voratiq/runs/123/claude-code/tests.log",
    },
    tests: {
      status: "passed",
      command: "npm test",
      exitCode: 0,
      logPath: ".voratiq/runs/123/claude-code/tests.log",
    },
    error: undefined,
  };

  it("maps agent report fields and derivations", () => {
    const report = toAgentReport(baseAgentRecord, {
      diffAttempted: true,
      diffCaptured: true,
      testsAttempted: true,
    });

    expect(report.agentId).toBe(baseAgentRecord.agentId);
    expect(report.changeSummary).toBe(baseAgentRecord.changeSummary);
    expect(report.diffAttempted).toBe(true);
    expect(report.diffCaptured).toBe(true);
    expect(report.testsAttempted).toBe(true);
    expect(report.tests).toEqual(baseAgentRecord.tests);
  });

  it("maps run report fields and validates derived flags", () => {
    const agentReport = toAgentReport(baseAgentRecord, {
      diffAttempted: true,
      diffCaptured: true,
      testsAttempted: true,
    });

    const runRecord: RunRecord = {
      runId: "test-run",
      spec: { path: "specs/sample.md", sha256: "deadbeef" },
      createdAt: new Date(0).toISOString(),
      baseRevision: "abc123",
      rootPath: ".",
      runPath: ".voratiq/runs/test-run",
      agents: [baseAgentRecord],
    };

    const runReport = toRunReport(runRecord, [agentReport], false, false);
    expect(runReport.runId).toBe(runRecord.runId);
    expect(runReport.agents).toHaveLength(1);
    expect(runReport.hadAgentFailure).toBe(false);
    expect(runReport.hadTestFailure).toBe(false);
  });

  it("throws when aggregated flags disagree with derived values", () => {
    const failingAgent: AgentReport = {
      agentId: "codex",
      status: "failed",
      changeSummary: undefined,
      assets: {
        stdout: ".voratiq/runs/bad/codex/stdout.log",
        stderr: ".voratiq/runs/bad/codex/stderr.log",
        workspace: ".voratiq/runs/bad/codex/workspace",
      },
      tests: undefined,
      error: "Agent failed to modify the workspace",
      diffAttempted: false,
      diffCaptured: false,
      testsAttempted: false,
    };

    const runRecord: RunRecord = {
      runId: "bad-run",
      spec: { path: "specs/sample.md" },
      createdAt: new Date(0).toISOString(),
      baseRevision: "def456",
      rootPath: ".",
      runPath: ".voratiq/runs/bad-run",
      agents: [],
    };

    expect(() => toRunReport(runRecord, [failingAgent], false, false)).toThrow(
      /hadAgentFailure/,
    );
  });
});
