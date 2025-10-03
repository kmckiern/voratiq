import type { AgentId } from "../agents/types.js";

export interface AgentArtifactSummary {
  stdout: string;
  stderr: string;
  diff?: string;
  tests?: string;
}

export interface AgentLogSummary {
  agentId: AgentId;
  status: "succeeded" | "failed";
  changeSummary?: string;
  attemptedDiff: boolean;
  capturedDiff: boolean;
  attemptedTests: boolean;
  testsStatus?: "passed" | "failed" | "skipped";
  testsExitCode?: number | null;
  artifacts: AgentArtifactSummary;
}

export interface RenderRunSummaryOptions {
  specPath: string;
  runId: string;
  agentSummaries: AgentLogSummary[];
}

export function renderRunSummary(options: RenderRunSummaryOptions): string {
  const { specPath, runId, agentSummaries } = options;

  const lines: string[] = [];

  lines.push(
    "",
    `Running agents against spec: ${specPath}`,
    `Run ID: ${runId}`,
    "",
  );

  agentSummaries.forEach((summary, index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(`${summary.agentId}:`);
    lines.push("  - Running agent...");

    if (summary.attemptedDiff) {
      lines.push("  - Capturing diff...");
    }

    if (summary.attemptedTests) {
      lines.push("  - Running tests...");
    }

    lines.push(`  - Status: ${summary.status}`);

    if (summary.attemptedTests && summary.testsStatus) {
      const exitCodeSuffix =
        summary.testsStatus === "failed" && summary.testsExitCode !== undefined
          ? ` (exit code ${summary.testsExitCode ?? "unknown"})`
          : "";
      lines.push(`  - Tests: ${summary.testsStatus}${exitCodeSuffix}`);
    }

    if (summary.changeSummary) {
      lines.push(`  - Changes: ${summary.changeSummary}`);
    }

    const artifactEntries = buildArtifactLines(summary.artifacts);
    if (artifactEntries.length > 0) {
      lines.push("  - Artifacts:");
      artifactEntries.forEach((entry) => {
        lines.push(`    - ${entry}`);
      });
    }
  });

  lines.push(
    "",
    "Run complete. To review results, run:",
    `  voratiq review ${runId}`,
  );

  return lines.join("\n");
}

function buildArtifactLines(artifacts: AgentArtifactSummary): string[] {
  const entries: string[] = [];

  entries.push(`stdout: ${artifacts.stdout}`);
  entries.push(`stderr: ${artifacts.stderr}`);

  if (artifacts.diff) {
    entries.push(`diff: ${artifacts.diff}`);
  }

  if (artifacts.tests) {
    entries.push(`tests: ${artifacts.tests}`);
  }

  return entries;
}
