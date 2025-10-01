import { join, relative } from "node:path";

export function resolvePath(root: string, ...segments: string[]): string {
  return join(root, ...segments);
}

export function relativeToRoot(root: string, target: string): string {
  return relative(root, target) || ".";
}

export function normalizePathForDisplay(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return normalized.replace(/\/+$/u, "");
}
