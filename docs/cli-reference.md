# Voratiq CLI Reference

Weekend MVP CLI that runs three built-in agents (`claude-code`, `codex`, `gemini`) against a spec and captures the reviewer decision. See `docs/agents/gemini.md` for Gemini-specific setup steps.

## Quickstart

1. **Initialize the workspace.** From the repo root, create the `.voratiq/` directory, empty run log, and default config.

   ```bash
   voratiq init
   ```

2. **Run all agents on a spec.** Provide the spec Markdown path; the CLI executes each agent in turn, stores patches/logs, and appends a run record.

   ```bash
   voratiq run --spec specs/terminal-animation.md
   ```

3. **Review and pick a winner.** Inspect the generated summaries and record the winning agent (or reject both).

   ```bash
   voratiq review
   ```

4. **Apply the winning patch (optional).** Apply the stored diff to your working tree after the decision.

   ```bash
   voratiq apply <run-id>
   ```

## Command Map

Run commands as `voratiq <command> [options]`.

**`init`** – bootstrap `.voratiq/`

- Creates `.voratiq/runs.jsonl`, `.voratiq/config.json`, and `.voratiq/runs/`.
- Idempotent; safe to run multiple times.

**`run`** – execute all agents against a spec

- `--spec <spec>` (required) – spec Markdown path (relative or absolute).
- `--test-command "..."` – override default test hook for this run.
- `--id <run-id>` – debug override for generated run identifier.

Behavior: prepares worktrees, runs `claude-code`, `codex`, and `gemini` (when configured), captures diffs/logs/tests, writes a run entry to `runs.jsonl`, and prints summary with artifact paths.

**`review`** – record the reviewer decision

- `--run <run-id>` – review a specific run; defaults to the latest undecided run.

Behavior: displays per-agent status table (tests, patch stats, artifact locations), prompts for winner (`claude-code`, `codex`, `gemini`, `reject`), optional note, then updates run record with decision metadata.

**`apply`** – apply winning patch to working tree

- `<run-id>` – required run identifier.
- `--check` – dry-run apply.
- `--no-3way` – disable three-way merge.

Behavior: validates decision, applies patch, and prints reminder to inspect and commit manually.

**`status`** – list recent runs

- `--limit <n>` – max rows (default 5, max 50).

Behavior: shows run id, timestamp, spec path, per-agent test status, and winner.

**`cleanup`** (optional future) – remove stale worktrees/artifacts. Not part of weekend scope yet.

## Artifacts

- `.voratiq/runs.jsonl` – append-only log of runs and decisions.
- `.voratiq/runs/<run-id>/<agent>/` – per-agent patches and logs.
- `.voratiq/config.json` – remembers last spec path and default test command.

All paths printed by commands are repo-relative for easy navigation.
