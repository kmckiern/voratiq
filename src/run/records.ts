import { appendFile } from "node:fs/promises";

import type { RunRecord } from "./types.js";

export async function appendRunRecord(
  runsFilePath: string,
  record: RunRecord,
): Promise<void> {
  const payload = `${JSON.stringify(record)}\n`;
  await appendFile(runsFilePath, payload, { encoding: "utf8" });
}
