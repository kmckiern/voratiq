# `voratiq run` Overview

This document describes how the `voratiq run` command orchestrates agents, manages git state, and produces artifacts. It captures the functional contract we rely on today—if we rebuilt the command from scratch, these requirements would shape the implementation.

## Objectives

- Execute each configured agent in isolation against the same spec.
- Collect precise diffs, summaries, logs, and test results with no manual steps.
- Fail fast whenever assumptions are violated (invalid workspace, agent misbehaviour, git error, test failure).
- Keep the resulting worktrees inspectable so follow-up commands or humans can examine them.

## Execution flow

1. **Preflight**
   - Ensure the caller is at the repository root and `.voratiq/` exists with the expected structure.
   - Validate the spec path provided via `--path` (absolute or relative).
   - Abort immediately on any mismatch; do not attempt auto-repair.

2. **Run scaffolding**
   - Generate a unique run ID (UTC timestamp + random slug).
   - Create `.voratiq/runs/<run-id>/` and per-agent subdirectories.
   - For each agent:
     - Materialise `stdout.log`, `stderr.log`, `diff.patch`, optional `tests.log` placeholders.
     - Add a git worktree rooted at `<agent>/workspace/`. If branch creation fails (permissions, existing branch, etc.), abort the run and surface the error.

3. **Agent invocation**
   - Spawn the agent binary with static argv plus a generated prompt that instructs it to edit files only and write a summary to `.summary.txt` inside the workspace.
   - Provide the environment variables described in the headless agent guide.
   - Wait for the process to exit; no retries or interactive prompts are issued.

4. **Harvesting**
   - Read the summary file, copy its contents to `<agent>/summary.txt`, and remove the workspace copy.
   - Run `git add -A` in the workspace. If nothing was staged, record the summary and continue; otherwise commit using the summary text (or a deterministic fallback) and capture the new commit SHA.
   - Diff the commit against the recorded base revision and write the result to `diff.patch`.
   - Execute the optional `--test-command` (if provided). Record pass/fail and logs. Treat non-zero exit codes as agent failure (but do not roll back the commit).

5. **Record keeping**
   - Append a JSON line to `.voratiq/runs.jsonl` containing run metadata (spec path, base revision, per-agent summaries, commit SHAs, test status, artifact paths).
   - Write final CLI output describing the run and the follow-up `voratiq review` command.

## Artifacts per agent

The following files live under `.voratiq/runs/<run-id>/<agent>/` after the run completes:

| Artifact      | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `stdout.log`  | Process stdout (formatted output, JSON, etc.).              |
| `stderr.log`  | Process stderr and internal warnings.                       |
| `summary.txt` | Copied summary text supplied by the agent.                  |
| `diff.patch`  | Diff between the base revision and the orchestrator commit. |
| `workspace/`  | Git worktree with the committed files for inspection.       |
| `tests.log`   | Optional log of the `--test-command` execution.             |

## Principles

- **No fallbacks.** Every failure (workspace validation, worktree add, agent crash, git staging, commit, diff, tests) aborts the run and reports the error. Silent retries or degraded modes are not allowed.
- **Immutable history.** Only the orchestrator issues commits. Agents never run git commands. Commits are deterministic and tagged with a consistent author identity.
- **Audit-ready.** All critical data (diffs, summaries, logs, tests) live in predictable locations so downstream tooling can consume them without guessing.
- **Inspectable worktrees.** Finished worktrees stay on disk. Review commands or humans can inspect them later; cleanup is a separate explicit action.

## Lessons applied

- **Git permissions.** Some agent CLIs lacked permission to write into the primary `.git/` directory. Moving commits into the orchestrator eliminated those failures.
- **Prompt clarity.** Agents attempted git operations when the prompt was ambiguous. The current contract forbids git, making violations explicit.
- **Summary required.** Having the agent describe its output ensures reviewers receive context even before running `voratiq review`.
- **Fast fail philosophy.** Earlier attempts to “keep going” after partial failures caused misleading artifacts. We now stop at the first inconsistency so misconfigurations are fixed at the source.

This overview should be sufficient to rebuild `voratiq run` from first principles while maintaining the guarantees we rely on today.
