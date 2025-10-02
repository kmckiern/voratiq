import { renderRunSummary } from "../../src/logs/run.js";
import type { AgentLogSummary } from "../../src/logs/run.js";

describe("renderRunSummary", () => {
  it("formats output aligned with run command design", () => {
    const agentSummaries: AgentLogSummary[] = [
      {
        agentId: "claude-code",
        status: "succeeded",
        changeSummary: "1 file changed, 10 insertions(+), 2 deletions(-)",
        attemptedDiff: true,
        capturedDiff: true,
        attemptedTests: true,
        testsStatus: "passed",
        testsExitCode: 0,
        artifacts: {
          stdout: ".voratiq/runs/20251001-143500-fghij/claude-code/stdout.log",
          stderr: ".voratiq/runs/20251001-143500-fghij/claude-code/stderr.log",
          diff: ".voratiq/runs/20251001-143500-fghij/claude-code/diff.patch",
          tests: ".voratiq/runs/20251001-143500-fghij/claude-code/tests.log",
        },
      },
      {
        agentId: "codex",
        status: "succeeded",
        changeSummary: "2 files changed, 15 insertions(+), 5 deletions(-)",
        attemptedDiff: true,
        capturedDiff: true,
        attemptedTests: true,
        testsStatus: "failed",
        testsExitCode: 1,
        artifacts: {
          stdout: ".voratiq/runs/20251001-143500-fghij/codex/stdout.log",
          stderr: ".voratiq/runs/20251001-143500-fghij/codex/stderr.log",
          diff: ".voratiq/runs/20251001-143500-fghij/codex/diff.patch",
          tests: ".voratiq/runs/20251001-143500-fghij/codex/tests.log",
        },
      },
    ];

    const output = renderRunSummary({
      specPath: "tests/fixtures/hello-world.md",
      runId: "20251001-143500-fghij",
      agentSummaries,
    });

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
});
