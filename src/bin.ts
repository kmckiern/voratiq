#!/usr/bin/env node

import process from "node:process";

import { runInitCommand } from "./cli/init.js";
import { runRunCommand } from "./cli/run.js";
import { toErrorMessage } from "./utils/errors.js";

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  try {
    if (!command || command === "--help" || command === "-h") {
      printHelp();
      return;
    }

    switch (command) {
      case "init":
        await runInitCommand(args);
        return;
      case "run":
        await runRunCommand(args);
        return;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    process.stderr.write(`${toErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

function printHelp(): void {
  const lines = [
    "Usage: voratiq <command>",
    "",
    "Commands:",
    "  init       Bootstrap the Voratiq workspace",
    "  run        Execute configured agents against a spec",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

void main();
