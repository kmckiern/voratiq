import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";

const { F_OK } = fsConstants;

export class GitRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitRepositoryError";
  }
}

export async function assertGitRepository(root: string): Promise<void> {
  const gitPath = join(root, ".git");
  try {
    await access(gitPath, F_OK);
  } catch {
    throw new GitRepositoryError(
      "Failed to locate .git metadata. Run `voratiq init` from the repository root.",
    );
  }
}
