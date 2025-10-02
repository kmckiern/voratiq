import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { GitRepositoryError } from "./errors.js";

const execFileAsync = promisify(execFile);
const { F_OK } = fsConstants;

export interface GitCommandOptions {
  cwd: string;
  trim?: boolean;
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

export async function runGitCommand(
  args: string[],
  options: GitCommandOptions,
): Promise<string> {
  const { cwd, trim = true } = options;
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return trim ? stdout.trim() : stdout;
}

export async function getHeadRevision(cwd: string): Promise<string> {
  return runGitCommand(["rev-parse", "HEAD"], { cwd });
}

export interface CreateWorktreeOptions {
  root: string;
  worktreePath: string;
  branch: string;
  baseRevision: string;
}

export async function createWorktree(
  options: CreateWorktreeOptions,
): Promise<void> {
  const { root, worktreePath, branch, baseRevision } = options;
  await runGitCommand(
    ["worktree", "add", "-b", branch, worktreePath, baseRevision],
    { cwd: root },
  );
}

export async function removeWorktree(
  root: string,
  worktreePath: string,
): Promise<void> {
  await runGitCommand(["worktree", "remove", worktreePath], { cwd: root });
}

export async function gitAddAll(cwd: string): Promise<void> {
  await runGitCommand(["add", "-A"], { cwd });
}

export async function gitHasStagedChanges(cwd: string): Promise<boolean> {
  const output = await runGitCommand(["diff", "--cached", "--name-only"], {
    cwd,
    trim: true,
  });
  return output.length > 0;
}

export interface GitCommitOptions {
  cwd: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
}

export async function gitCommitAll(options: GitCommitOptions): Promise<void> {
  const { cwd, message, authorEmail = "cli@voratiq", authorName = "Voratiq" } =
    options;

  await runGitCommand(
    [
      "-c",
      `user.name=${authorName}`,
      "-c",
      `user.email=${authorEmail}`,
      "commit",
      "-m",
      message,
    ],
    { cwd },
  );
}

export interface GitDiffStatOptions {
  cwd: string;
  baseRevision: string;
  targetRevision: string;
}

export async function gitDiffShortStat(
  options: GitDiffStatOptions,
): Promise<string | undefined> {
  const { cwd, baseRevision, targetRevision } = options;
  const output = await runGitCommand(
    ["diff", "--shortstat", baseRevision, targetRevision],
    { cwd },
  );

  return output.length === 0 ? undefined : output;
}

export async function gitDiff(
  options: GitDiffStatOptions,
): Promise<string> {
  const { cwd, baseRevision, targetRevision } = options;
  return runGitCommand(
    ["diff", "--no-color", baseRevision, targetRevision],
    { cwd, trim: false },
  );
}
