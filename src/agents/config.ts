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

const AGENT_DEFAULT_ARGV: Record<AgentId, readonly string[]> = {
  "claude-code": [
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Bash,Read,Edit",
    "--model",
    "{{MODEL}}",
  ],
  codex: [
    "exec",
    "--sandbox",
    "workspace-write",
    "--experimental-json",
    "--full-auto",
    "-c",
    "mcp_servers={}",
    "--model",
    "{{MODEL}}",
    "--prompt",
  ],
  gemini: [
    "generate",
    "--model",
    "{{MODEL}}",
    "--prompt",
    "--output-format",
    "json",
  ],
} as const;

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
  const argv = applyModelPlaceholder(argvTemplate, model, agentId);

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

  return ensureNonEmptyString(
    rawValue,
    `Missing environment variable: ${prefix}_BINARY for agent ${agentId}`,
  ).trim();
}

function buildArgvTemplate(
  agentId: AgentId,
  env: AgentEnvironment,
  prefix: string,
): string[] {
  const defaults = AGENT_DEFAULT_ARGV[agentId] ?? [];
  const extras = parseArgv(env[`${prefix}_ARGV`], agentId, prefix);
  return [...defaults, ...extras];
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
      `Expected argv for agent ${agentId} to include ${MODEL_PLACEHOLDER}`,
    );
  }

  return substituted;
}
