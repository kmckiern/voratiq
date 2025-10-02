import process from "node:process";

import {
  AgentCatalog,
  AgentDefinition,
  AgentId,
  KNOWN_AGENT_IDS,
} from "./types.js";

export interface LoadAgentCatalogOptions {
  env?: NodeJS.ProcessEnv;
}

export function loadAgentCatalog(
  options: LoadAgentCatalogOptions = {},
): AgentCatalog {
  const { env = process.env } = options;

  return KNOWN_AGENT_IDS.map((agentId) =>
    loadAgentDefinition(agentId, env),
  );
}

function loadAgentDefinition(
  agentId: AgentId,
  env: NodeJS.ProcessEnv,
): AgentDefinition {
  const prefix = buildEnvPrefix(agentId);

  const binary = env[`${prefix}_BINARY`];
  if (!binary) {
    throw new Error(
      `Missing environment variable: ${prefix}_BINARY for agent ${agentId}`,
    );
  }

  const argvValue = env[`${prefix}_ARGV`];
  const argv = parseArgv(argvValue, agentId, prefix);

  const model = env[`${prefix}_MODEL`] ?? agentId;

  return {
    id: agentId,
    model,
    binaryPath: binary,
    argv,
  } satisfies AgentDefinition;
}

function buildEnvPrefix(agentId: AgentId): string {
  const normalized = agentId
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/gu, "_");
  return `VORATIQ_AGENT_${normalized}`;
}

function parseArgv(
  value: string | undefined,
  agentId: AgentId,
  prefix: string,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(
      `Invalid JSON array provided via ${prefix}_ARGV for agent ${agentId}`,
    );
  }
}
