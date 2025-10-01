import { renderInitSuccess } from "../logs/index.js";
import { createWorkspace } from "../workspace/index.js";
import { resolveCliContext } from "./context.js";

export async function runInitCommand(args: string[]): Promise<void> {
  if (args.length > 0) {
    throw new Error(`Unexpected arguments: ${args.join(" ")}`);
  }

  const { root } = await resolveCliContext({ requireWorkspace: false });

  const result = await createWorkspace(root);

  const summary = renderInitSuccess({ result });
  process.stdout.write(`${summary}\n`);
}
