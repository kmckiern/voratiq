import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";

export const { F_OK } = fsConstants;

type ErrorOrFactory = Error | (() => Error);

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function ensureDirectoryExists(
  path: string,
  error: ErrorOrFactory,
): Promise<void> {
  if (!(await isDirectory(path))) {
    throw resolveError(error);
  }
}

export async function ensureFileExists(
  path: string,
  error: ErrorOrFactory,
): Promise<void> {
  if (!(await isFile(path))) {
    throw resolveError(error);
  }
}

function resolveError(error: ErrorOrFactory): Error {
  return typeof error === "function" ? error() : error;
}
