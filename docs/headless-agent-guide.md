# Headless Agent Configuration Guide

This guide explains how external coding agents should be configured so that `voratiq run` can orchestrate them deterministically. The goal is to give every agent the same contract: produce changes in the workspace, describe the work, and exit without attempting any repository operations. The CLI takes care of everything else.

## Guiding principles

1. **Single responsibility.** Agents edit files and describe their work. They never run git commands, modify metadata, or attempt to stage/commit results. Attempts to circumvent this contract cause the run to fail immediately.
2. **Deterministic inputs.** Every run supplies the same core environment variables and prompt structure. Agents must rely on those values only—no hidden state, no prompts that vary by implementation.
3. **Zero fallbacks.** If an agent cannot execute within these constraints (for example, it requires filesystem access beyond the workspace), the run is rejected. We do not silently switch modes or mask the failure.

## Environment

Agents receive the ambient shell environment only. If a model requires additional credentials or flags, set them explicitly in the invocation script or argv; avoid assuming extra variables will be present.

## Prompt contract

The orchestrator presents the agent with a concise prompt:

- Implement the provided spec.
- Write a one- or two-sentence summary of the change into `.summary.txt` in the workspace root, then stop.
- Do **not** run git or auxiliary tooling that mutates repository metadata.

Anything beyond those instructions could confuse / distract the agent and risks conflicting with the orchestration layer and is considered a violation of the contract.

## Binary configuration

Each agent binary is configured via environment variables (for example, `.env.local`). Set:

- `VORATIQ_AGENT_<ID>_BINARY` – absolute path to the executable.
- `VORATIQ_AGENT_<ID>_ARGV` – JSON array of static CLI arguments. Include `{{MODEL}}` somewhere in the array; Voratiq replaces that token with the configured model string before spawning the agent.
- `VORATIQ_AGENT_<ID>_MODEL` – required model identifier recorded in run logs and exported to the agent process as `VORATIQ_AGENT_MODEL`.

Recommendations for the current reference agents:

- **Claude Code**: include `-p` (headless mode), `--output-format json`, and a fixed model identifier. Avoid permission prompts by supplying the CLI’s auto-approval flag if available.
- **OpenAI Codex CLI**: use `exec` for headless execution, `--sandbox workspace-write`, and `--experimental-json` for structured output. Disable optional MCP integrations by setting `-c mcp_servers={}` unless explicitly required. Attach `--model {{MODEL}}` (or whatever flag the CLI expects) in `VORATIQ_AGENT_CODEX_ARGV` so the orchestrator’s `VORATIQ_AGENT_MODEL` drives the runtime behavior automatically.

## Summary file expectations

- The summary file (`.summary.txt` in the workspace root) is mandatory. If the agent exits without writing it, the run fails.
- The file must contain plain UTF-8 text (one or two sentences). The orchestrator deletes the workspace copy after reading it and stores the summary alongside other artifacts.
- Agents must not rename or move the file.

## Workspace constraints

- Agents operate inside a dedicated git worktree located at `.voratiq/runs/<run-id>/<agent>/workspace/`.
- Only files within this directory are writable. Attempts to access other locations, including the main `.git/` directory, can trigger permission errors and abort the run.
- Agents should avoid creating long-lived background processes; the orchestrator expects the binary to exit when work is complete.

## Failure policy

If an agent violates any rule—missing summary, git command execution, metadata edits, permission errors—the run stops immediately with a surfaced error message. There are no retries, interactive fallbacks, or alternative execution paths. This is intentional: a failure should highlight misconfiguration or missing capabilities so it can be addressed directly. When a failure occurs, the CLI also tells you whether the workspace was modified so you can decide at a glance if there is code to inspect.

By configuring agents according to this document, we ensure `voratiq run` can manage them predictably and produce consistent artifacts for downstream review. Recent Gemini CLI validation confirmed that `gemini generate --model <id> --prompt "..." --output-format json` combined with `CI=1` satisfies the non-interactive requirements and mirrors the conventions outlined below.
