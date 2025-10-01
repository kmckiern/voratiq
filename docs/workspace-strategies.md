# Workspace Strategies (Roadmap Notes)

This document captures the direction for supporting multiple execution backends while keeping the `.voratiq/` workspace contract stable.

## Current state (MVP)

- `voratiq init` expects to run from a git worktree and materializes `.voratiq/` inside the repository root.
- `createWorkspace` / `validateWorkspace` (see `src/workspace/index.ts`) operate on a simple `root` path and rely on the helpers in `src/utils/fs.ts`.
- CLI and tests rely solely on the `.voratiq/` layout; they do not assume any specific execution environment beyond the local filesystem.

## Long-term goals

- Make agent execution pluggable so we can run workflows inside alternative environments without rewriting command logic.
- Maintain a single, versioned workspace contract (`.voratiq/` directory structure + schemas in `src/cli/types.ts`, `src/run/types.ts`, `src/agents/types.ts`).
- Allow the CLI to choose a workspace strategy at runtime (e.g., flags, config, or environment variables).

## Strategy abstraction (future work)

Introduce a `WorkspaceStrategy` interface with responsibilities such as:

```ts
interface WorkspaceStrategy {
  /** Human-readable identifier (e.g., "git-worktree", "bubblewrap"). */
  id: string;

  /** Prepare the workspace and return the root path where `.voratiq/` will live. */
  prepare(options: PrepareOptions): Promise<PreparedWorkspace>;

  /** Clean up any temporary resources (containers, mounts, etc.). */
  cleanup?(workspace: PreparedWorkspace): Promise<void>;
}
```

`PreparedWorkspace` can expose:

```ts
interface PreparedWorkspace {
  root: string; // usable with existing fs helpers
  release(): Promise<void>; // optional convenience for callers
}
```

The git worktree implementation (today’s default) would simply return the repository root and no-op on `cleanup`.

## Next strategy: Bubblewrap (not yet implemented)

When we add bubblewrap support:

- Create a `BubblewrapWorkspaceStrategy` that:
  - Spawns a bubblewrap sandbox.
  - Bind-mounts the repo and `.voratiq/` into the sandbox.
  - Returns paths inside the sandbox as the `root` for agents to use.
- Reuse `createWorkspace` / `validateWorkspace` inside the sandbox to keep the on-disk contract identical.
- Provide a feature flag or CLI option so we can switch between `git-worktree` and `bubblewrap` without code changes elsewhere.

## Short-term plan

- Keep the current git-worktree flow as the only implemented strategy.
- Revisit this document when we begin the bubblewrap work; that is the moment to introduce the `WorkspaceStrategy` interface and strategy selection logic.
- Until then, additional commands (e.g., `voratiq run`) should call the existing helpers directly and avoid preemptive abstractions.

## Implementation notes (future)

- Keep strategy selection logic isolated (e.g., a function `selectWorkspaceStrategy(config)` returning the right implementation).
- Ensure logging and error reporting mention which strategy was used when runs fail.
- Tests should focus on the contract (e.g., `.voratiq/` layout) rather than specific environment details.

## Open questions

- How do we persist additional metadata about the strategy used (e.g., annotate run records)?
- What configuration surface should choose strategies (CLI flag, config file, environment variable)?
- Do we need a cleanup hook for git worktree workspaces (likely no, but the interface allows it)?

Document will be updated once the bubblewrap strategy lands.
