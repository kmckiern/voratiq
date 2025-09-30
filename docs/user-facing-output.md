# User-Facing CLI Output

This document explains how we centralize terminal messages that users see when they run the Voratiq CLI. The goal is to keep copy, tone, and formatting consistent across commands while allowing engineers to iterate quickly on phrasing without editing multiple modules.

## Directory: `src/logs/`

`src/logs/` is the home for user-visible messaging helpers. It is not for debug logs or internal tracing; those can remain near the code that emits them. Instead, this directory should contain:

- **Message catalogues** – data structures or modules that define the strings shown to users after commands succeed, progress updates, headings, etc.
- **Presentation helpers** – utilities for styling text (colors, bullets, alignment) and emitting it through `stdout` or a shared output interface.

Keep error messages (especially those thrown as exceptions) close to their origin so they can include contextual details. Only success/progress copy needs to flow through `src/logs/`.

## Why centralize copy?

- **Consistent voice** – one place to adjust tone and style as we iterate.
- **Fewer regressions** – when requirements change (e.g. add a warning banner), we can update the catalog and know every command inherits it.
- **Future streaming** – the same helpers can evolve into structured streaming updates without touching each command’s business logic.

## Recommended structure

```
src/logs/
  index.ts          // export high-level helpers
  init.ts           // messages specific to `voratiq init`
  run.ts            // messages specific to `voratiq run`
  format.ts         // shared formatting utilities (colors, tables, spinners)
```

- Keep command-specific text in their own files to avoid collisions and to make reviews easier.
- Re-export the pieces you need from `src/logs/index.ts` so commands can import from a single path.
- If you introduce dynamic data (e.g. counts, paths), prefer tagged template functions or small render functions so formatting stays consistent.

## Usage patterns

1. Command logic prepares the data it wants to report (workspace location, agent summary, etc.).
2. It calls a `logs` helper, passing that data.
3. The helper formats and writes to `stdout` using shared conventions.

Example:

```ts
// src/logs/init.ts
export function renderInitSuccess(result: InitResult): string {
  return [
    "Voratiq workspace ready!",
    `  • Created: ${result.createdDirectories.join(", ")}`,
    `  • Config: ${result.configPath}`,
  ].join("\n");
}

// src/cli/init.ts
import { renderInitSuccess } from "../logs/init.js";

console.log(renderInitSuccess(result));
```

Even if you later switch to rich terminal output (spinners, colors), the command layer still only imports from `src/logs/`.

## Future considerations

- **Streaming updates** – introduce an event emitter in `src/logs/` that handles incremental output while maintaining the same copy catalog.
- **Localization** – centralizing text makes it possible to swap catalogs per locale without touching command logic.
- **Testing** – helpers returning strings (instead of writing directly) make it easier to snapshot test the CLI output.

Keep this document up to date as the logging layer evolves.
