import { renderInitSuccess } from "../logs/index.js";
import { assertGitRepository } from "../utils/git.js";
import { createWorkspace, validateWorkspace } from "../workspace/index.js";

export async function runInitCommand(args: string[]): Promise<void> {
  if (args.length > 0) {
    throw new Error(`Unexpected arguments: ${args.join(" ")}`);
  }

  const root = process.cwd();

  await assertGitRepository(root);

  const result = await createWorkspace(root);

  await validateWorkspace(root);

  const summary = renderInitSuccess({ result });
  process.stdout.write(`${summary}\n`);
}
