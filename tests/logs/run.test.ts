import { renderRunSummary } from "../../src/logs/run.js";
import type { AgentReport, RunReport } from "../../src/run/types.js";

describe("renderRunSummary", () => {
  it("formats output aligned with run command design", () => {
    const agents: AgentReport[] = [
      {
        agentId: "claude-code",
        status: "succeeded",
        changeSummary: "1 file changed, 10 insertions(+), 2 deletions(-)",
        assets: {
          stdout: ".voratiq/runs/20251001-143500-fghij/claude-code/stdout.log",
          stderr: ".voratiq/runs/20251001-143500-fghij/claude-code/stderr.log",
          workspace:
            ".voratiq/runs/20251001-143500-fghij/claude-code/workspace",
          diff: ".voratiq/runs/20251001-143500-fghij/claude-code/diff.patch",
          summary:
            ".voratiq/runs/20251001-143500-fghij/claude-code/summary.txt",
          tests: ".voratiq/runs/20251001-143500-fghij/claude-code/tests.log",
        },
        tests: {
          status: "passed",
          command: "npm test",
          exitCode: 0,
          logPath: ".voratiq/runs/20251001-143500-fghij/claude-code/tests.log",
        },
        error: undefined,
        diffAttempted: true,
        diffCaptured: true,
        testsAttempted: true,
      },
      {
        agentId: "codex",
        status: "succeeded",
        changeSummary: "2 files changed, 15 insertions(+), 5 deletions(-)",
        assets: {
          stdout: ".voratiq/runs/20251001-143500-fghij/codex/stdout.log",
          stderr: ".voratiq/runs/20251001-143500-fghij/codex/stderr.log",
          workspace: ".voratiq/runs/20251001-143500-fghij/codex/workspace",
          diff: ".voratiq/runs/20251001-143500-fghij/codex/diff.patch",
          summary: ".voratiq/runs/20251001-143500-fghij/codex/summary.txt",
          tests: ".voratiq/runs/20251001-143500-fghij/codex/tests.log",
        },
        tests: {
          status: "failed",
          command: "npm test",
          exitCode: 1,
          logPath: ".voratiq/runs/20251001-143500-fghij/codex/tests.log",
        },
        error: undefined,
        diffAttempted: true,
        diffCaptured: true,
        testsAttempted: true,
      },
    ];

    const report: RunReport = {
      runId: "20251001-143500-fghij",
      spec: { path: "tests/fixtures/hello-world.md", sha256: "abc123" },
      agents,
      hadAgentFailure: false,
      hadTestFailure: true,
    };

    const output = renderRunSummary(report);

    const expected = [
      "",
      "Running agents against spec: tests/fixtures/hello-world.md",
      "Run ID: 20251001-143500-fghij",
      "",
      "claude-code:",
      "  - Running agent...",
      "  - Capturing diff...",
      "  - Running tests...",
      "  - Status: succeeded",
      "  - Tests: passed",
      "  - Changes: 1 file changed, 10 insertions(+), 2 deletions(-)",
      "  - Artifacts:",
      "    - stdout: .voratiq/runs/20251001-143500-fghij/claude-code/stdout.log",
      "    - stderr: .voratiq/runs/20251001-143500-fghij/claude-code/stderr.log",
      "    - diff: .voratiq/runs/20251001-143500-fghij/claude-code/diff.patch",
      "    - tests: .voratiq/runs/20251001-143500-fghij/claude-code/tests.log",
      "",
      "codex:",
      "  - Running agent...",
      "  - Capturing diff...",
      "  - Running tests...",
      "  - Status: succeeded",
      "  - Tests: failed (exit code 1)",
      "  - Changes: 2 files changed, 15 insertions(+), 5 deletions(-)",
      "  - Artifacts:",
      "    - stdout: .voratiq/runs/20251001-143500-fghij/codex/stdout.log",
      "    - stderr: .voratiq/runs/20251001-143500-fghij/codex/stderr.log",
      "    - diff: .voratiq/runs/20251001-143500-fghij/codex/diff.patch",
      "    - tests: .voratiq/runs/20251001-143500-fghij/codex/tests.log",
      "",
      "Run complete. To review results, run:",
      "  voratiq review 20251001-143500-fghij",
    ].join("\n");

    expect(output).toBe(expected);
  });

  it("includes failure messaging for agents that error", () => {
    const failingAgent: AgentReport = {
      agentId: "codex",
      status: "failed",
      changeSummary: undefined,
      assets: {
        stdout: ".voratiq/runs/20251003-052332-ikneb/codex/stdout.log",
        stderr: ".voratiq/runs/20251003-052332-ikneb/codex/stderr.log",
        workspace: ".voratiq/runs/20251003-052332-ikneb/codex/workspace",
      },
      tests: undefined,
      error: "Agent failed to modify the workspace",
      diffAttempted: false,
      diffCaptured: false,
      testsAttempted: false,
    };

    const report: RunReport = {
      runId: "20251003-052332-ikneb",
      spec: { path: "tests/fixtures/run/hello-world.md" },
      agents: [failingAgent],
      hadAgentFailure: true,
      hadTestFailure: false,
    };

    const output = renderRunSummary(report);

    expect(output).toContain(
      "  - Status: failed (Agent failed to modify the workspace)",
    );
  });
});
