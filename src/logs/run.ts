import type { AgentReport, RunReport } from "../run/types.js";

export function renderRunSummary(report: RunReport): string {
  const lines: string[] = [];

  lines.push(
    "",
    `Running agents against spec: ${report.spec.path}`,
    `Run ID: ${report.runId}`,
    "",
  );

  report.agents.forEach((agent, index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(`${agent.agentId}:`);
    lines.push("  - Running agent...");

    if (agent.diffAttempted) {
      lines.push("  - Capturing diff...");
    }

    if (agent.testsAttempted) {
      lines.push("  - Running tests...");
    }

    const statusLine = buildStatusLine(agent);
    lines.push(statusLine);

    if (agent.testsAttempted && agent.tests) {
      const testsLine = buildTestsLine(agent);
      if (testsLine) {
        lines.push(testsLine);
      }
    }

    if (agent.changeSummary) {
      lines.push(`  - Changes: ${agent.changeSummary}`);
    }

    const artifactEntries = buildArtifactLines(agent);
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
    `  voratiq review ${report.runId}`,
  );

  return lines.join("\n");
}

function buildStatusLine(agent: AgentReport): string {
  if (agent.status === "failed" && agent.error) {
    return `  - Status: failed (${agent.error})`;
  }
  return `  - Status: ${agent.status}`;
}

function buildTestsLine(agent: AgentReport): string | undefined {
  const tests = agent.tests;
  if (!tests) {
    return undefined;
  }

  if (tests.error) {
    return `  - Tests: ${tests.error}`;
  }

  if (tests.status === "passed") {
    return "  - Tests: passed";
  }

  if (tests.status === "failed") {
    const exitCodeText =
      tests.exitCode !== undefined && tests.exitCode !== null
        ? ` (exit code ${tests.exitCode})`
        : "";
    return `  - Tests: failed${exitCodeText}`;
  }

  return `  - Tests: ${tests.status}`;
}

function buildArtifactLines(agent: AgentReport): string[] {
  const entries: string[] = [];

  entries.push(`stdout: ${agent.assets.stdout}`);
  entries.push(`stderr: ${agent.assets.stderr}`);

  if (agent.assets.diff) {
    entries.push(`diff: ${agent.assets.diff}`);
  }

  if (agent.assets.tests) {
    entries.push(`tests: ${agent.assets.tests}`);
  }

  return entries;
}
