import { execFileSync } from "node:child_process";
import process from "node:process";

import {
  ensureNonEmptyString,
  ensureStringArray,
} from "../utils/validators.js";
import {
  AgentCatalog,
  AgentDefinition,
  AgentId,
  KNOWN_AGENT_IDS,
} from "./types.js";

const MODEL_PLACEHOLDER = "{{MODEL}}";

type AgentEnvironment = Record<string, unknown>;

export interface LoadAgentCatalogOptions {
  env?: AgentEnvironment;
}

const GEMINI_COMMAND = "gemini" as const;
const GEMINI_DEFAULT_ARGV = [
  "generate",
  "--model",
  "{{MODEL}}",
  "--prompt",
  "--output-format",
  "json",
] as const;

let cachedGeminiBinaryPath: string | undefined;
let cachedGeminiBinaryError: Error | undefined;

export function loadAgentCatalog(
  options: LoadAgentCatalogOptions = {},
): AgentCatalog {
  const env: AgentEnvironment = options.env ?? process.env;

  return KNOWN_AGENT_IDS.map((agentId) => loadAgentDefinition(agentId, env));
}

function loadAgentDefinition(
  agentId: AgentId,
  env: AgentEnvironment,
): AgentDefinition {
  const prefix = buildEnvPrefix(agentId);

  const binaryValue = resolveBinaryPath(agentId, env, prefix);

  const model = parseModel(env[`${prefix}_MODEL`], agentId, prefix);

  const argvTemplate = buildArgvTemplate(agentId, env, prefix);
  const argv = applyModelPlaceholder(
    argvTemplate,
    model,
    agentId,
    prefix,
  );

  return {
    id: agentId,
    model,
    binaryPath: binaryValue,
    argv,
  } satisfies AgentDefinition;
}

function resolveBinaryPath(
  agentId: AgentId,
  env: AgentEnvironment,
  prefix: string,
): string {
  const envKey = `${prefix}_BINARY`;
  const rawValue = env[envKey];

  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    return rawValue.trim();
  }

  if (agentId === "gemini") {
    return resolveGeminiBinary(prefix);
  }

  return ensureNonEmptyString(
    rawValue,
    `Missing environment variable: ${prefix}_BINARY for agent ${agentId}`,
  ).trim();
}

function resolveGeminiBinary(prefix: string): string {
  if (cachedGeminiBinaryPath) {
    return cachedGeminiBinaryPath;
  }
  if (cachedGeminiBinaryError) {
    throw cachedGeminiBinaryError;
  }

  try {
    const resolved = execFileSync("command", ["-v", GEMINI_COMMAND], {
      encoding: "utf8",
    })
      .trim()
      .split("\n", 1)[0] ?? "";

    if (!resolved) {
      throw new Error("command -v returned no result");
    }

    cachedGeminiBinaryPath = resolved;
    return resolved;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const failure = new Error(
      `Unable to locate Gemini CLI binary. Set ${prefix}_BINARY or ensure '${GEMINI_COMMAND}' is on PATH (command -v gemini). ${detail}`,
    );
    cachedGeminiBinaryError = failure;
    throw failure;
  }
}

function buildArgvTemplate(
  agentId: AgentId,
  env: AgentEnvironment,
  prefix: string,
): string[] {
  const defaults = getDefaultArgv(agentId);
  const extra = parseArgv(env[`${prefix}_ARGV`], agentId, prefix);
  return [...defaults, ...extra];
}

function getDefaultArgv(agentId: AgentId): string[] {
  if (agentId === "gemini") {
    return [...GEMINI_DEFAULT_ARGV];
  }
  return [];
}

function buildEnvPrefix(agentId: AgentId): string {
  const normalized = agentId.toUpperCase().replaceAll(/[^A-Z0-9]/gu, "_");
  return `VORATIQ_AGENT_${normalized}`;
}

function parseArgv(value: unknown, agentId: AgentId, prefix: string): string[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return ensureStringArray(
      parsed,
      `Invalid JSON array provided via ${prefix}_ARGV for agent ${agentId}`,
    );
  } catch {
    throw new Error(
      `Invalid JSON array provided via ${prefix}_ARGV for agent ${agentId}`,
    );
  }
}

function parseModel(value: unknown, agentId: AgentId, prefix: string): string {
  const model = ensureNonEmptyString(
    value,
    `Missing environment variable: ${prefix}_MODEL for agent ${agentId}`,
  );

  return model.trim();
}

function applyModelPlaceholder(
  argv: string[],
  model: string,
  agentId: AgentId,
  prefix: string,
): string[] {
  let found = false;
  const substituted = argv.map((token) => {
    if (token.includes(MODEL_PLACEHOLDER)) {
      found = true;
      return token.replaceAll(MODEL_PLACEHOLDER, model);
    }
    return token;
  });

  if (!found) {
    throw new Error(
      `Expected ${prefix}_ARGV to include ${MODEL_PLACEHOLDER} for agent ${agentId}`,
    );
  }

  return substituted;
}

export function __resetAgentConfigForTests(): void {
  cachedGeminiBinaryPath = undefined;
  cachedGeminiBinaryError = undefined;
}
