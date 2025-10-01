#!/usr/bin/env node

import process from "node:process";

import { runInitCommand } from "./cli/init.js";

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
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function printHelp(): void {
  const lines = [
    "Usage: voratiq <command>",
    "",
    "Commands:",
    "  init       Bootstrap the Voratiq workspace",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

void main();
