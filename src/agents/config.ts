import process from "node:process";

import {
  AgentCatalog,
  AgentDefinition,
  AgentId,
  KNOWN_AGENT_IDS,
} from "./types.js";

type AgentEnvironment = Record<string, unknown>;

export interface LoadAgentCatalogOptions {
  env?: AgentEnvironment;
}

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

  const binaryValue = env[`${prefix}_BINARY`];
  if (typeof binaryValue !== "string" || binaryValue.length === 0) {
    throw new Error(
      `Missing environment variable: ${prefix}_BINARY for agent ${agentId}`,
    );
  }

  const modelValue = env[`${prefix}_MODEL`];
  const model = parseModel(modelValue, agentId, prefix);

  const argvValue = env[`${prefix}_ARGV`];
  const argvWithPlaceholder = parseArgv(argvValue, agentId, prefix);
  const argv = applyModelPlaceholder(
    argvWithPlaceholder,
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
    if (!isStringArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(
      `Invalid JSON array provided via ${prefix}_ARGV for agent ${agentId}`,
    );
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function parseModel(value: unknown, agentId: AgentId, prefix: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Missing environment variable: ${prefix}_MODEL for agent ${agentId}`,
    );
  }

  return value.trim();
}

const MODEL_PLACEHOLDER = "{{MODEL}}";

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
