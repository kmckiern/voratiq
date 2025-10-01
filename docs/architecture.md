# Voratiq Architecture

This note complements the product overview by describing the structural patterns in the codebase as of October 1, 2025.

## High-Level Structure

- **CLI front controller.** `src/bin.ts` is a thin executable that parses `process.argv`, displays help, and dispatches to command handlers. The binary stays decoupled from business logic; each command encapsulates its own orchestration.
- **Command modules.** The `src/cli/` directory groups command-specific flows (e.g., `init`) and cross-command utilities. Shared preflight checks (`src/cli/preflight.ts`) enforce repository/workspace invariants before any command runs.
- **Workspace service layer.** `src/workspace/index.ts` centralises filesystem concerns for `.voratiq/`, exposing idempotent helpers (`createWorkspace`, `validateWorkspace`) so commands never manipulate directories directly. This acts like an infrastructure/gateway layer in a classic layered or hexagonal architecture.
- **Domain schemas as contracts.** Runtime validation relies on Zod schemas in `src/cli/types.ts`, `src/agents/types.ts`, and `src/run/types.ts`. They define the shape of configs, agent catalogs, and run records, forming an application boundary between CLI input and stored artefacts.
- **Shared error taxonomy.** Purpose-built error classes (`src/cli/errors.ts`, `src/utils/errors.ts`, `src/workspace/errors.ts`) standardise failure reporting and surface actionable messages to the CLI, favouring explicit failures over silent fallbacks.

## Patterns and Roadmap Hooks

- **Command pattern.** Each CLI command is an isolated module called by the front controller. Future commands (`run`, `review`, `apply`, `status`) will plug into the same dispatch surface.
- **Strategy-ready workspace abstraction.** Documentation in `docs/workspace-strategies.md` outlines a future `WorkspaceStrategy` interface for alternate execution backends (e.g., bubblewrap). The current workspace layer is structured to slot in that Strategy pattern without rewriting command code.
- **Logging facade (in progress).** `src/logs/` is positioned as a single logging surface. `renderInitSuccess` is currently a stub; once filled in, it will provide consistent CLI output regardless of the command.

## Testing Boundaries

- `tests/cli/preflight.test.ts` uses `memfs` to exercise CLI setup logic without touching the real filesystem.
- `tests/workspace/index.test.ts` spins up temporary directories to verify workspace bootstrapping and validation contracts.

## Related Documents

- `docs/overview.md` – product context and workflow.
- `docs/cli-reference.md` – command lifecycle and roadmap for additional commands.
- `docs/workspace-strategies.md` – future strategy abstraction and backend roadmap.

Keep this file updated as new commands or workspace strategies land so it remains an accurate guide for contributors and reviewers.
