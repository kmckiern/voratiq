import { chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisFilePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(thisFilePath), "..");
const binPath = resolve(projectRoot, "dist", "bin.js");

async function ensureExecutable() {
  try {
    await chmod(binPath, 0o755);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      // Ignore missing dist/bin.js when build hasn't produced it yet.
      return;
    }
    throw error;
  }
}

function isNodeError(value) {
  return Boolean(value) && typeof value === "object" && "code" in value;
}

await ensureExecutable();
