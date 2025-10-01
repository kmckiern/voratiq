import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, relative } from "node:path";

export const { F_OK } = fsConstants;

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

export function resolvePath(root: string, ...segments: string[]): string {
  return join(root, ...segments);
}

export function relativeToRoot(root: string, target: string): string {
  return relative(root, target) || ".";
}
