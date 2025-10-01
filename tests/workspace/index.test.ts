import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CreateWorkspaceResult } from "../../src/workspace/index.js";
import {
  WorkspaceMissingEntryError,
  createWorkspace,
  resolveWorkspacePath,
  validateWorkspace,
} from "../../src/workspace/index.js";

async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "voratiq-init-"));
  await mkdir(join(dir, ".git"), { recursive: true });
  return dir;
}

function normalizeForAssertion(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("workspace bootstrap", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempRepo();
  });

  afterEach(async () => {
    if (repoRoot) {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("creates minimal workspace and validates", async () => {
    const result: CreateWorkspaceResult = await createWorkspace(repoRoot);

    const createdDirs = result.createdDirectories.map(normalizeForAssertion);
    const createdFiles = result.createdFiles.map(normalizeForAssertion);

    expect(createdDirs).toEqual(
      expect.arrayContaining([
        normalizeForAssertion(".voratiq"),
        normalizeForAssertion(join(".voratiq", "runs")),
      ]),
    );
    expect(createdFiles).toEqual(
      expect.arrayContaining([
        normalizeForAssertion(join(".voratiq", "config.json")),
        normalizeForAssertion(join(".voratiq", "runs.jsonl")),
      ]),
    );

    await expect(validateWorkspace(repoRoot)).resolves.toBeUndefined();
  });

  it("fails validation when config.json is missing", async () => {
    await createWorkspace(repoRoot);
    const configPath = resolveWorkspacePath(repoRoot, "config.json");
    await rm(configPath, { force: true });

    await expect(validateWorkspace(repoRoot)).rejects.toBeInstanceOf(
      WorkspaceMissingEntryError,
    );
  });

  it("fails validation when config.json is empty", async () => {
    await createWorkspace(repoRoot);
    const configPath = resolveWorkspacePath(repoRoot, "config.json");
    await writeFile(configPath, "");

    await expect(validateWorkspace(repoRoot)).rejects.toThrow(
      "config.json is empty",
    );
  });
});
