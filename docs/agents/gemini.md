# Gemini Agent

Google's Gemini CLI can run headlessly inside `voratiq run`, producing the same artifacts as existing agents. This guide explains how to install the CLI, authenticate, and configure Voratiq to invoke Gemini alongside other tools.

> Research note: Gemini's CLI accepts non-interactive prompts via `--prompt`/`-p`, respects `CI=1` (or any `CI_*` value) to disable interactive flows, and can stream structured output with `--output-format json`. Use these flags when running in CI to ensure deterministic behavior.

## Installation

1. Install Node.js 20 or newer.
2. Install the CLI globally: `npm install -g @google/gemini-cli`.
3. Verify availability: `command -v gemini` should print the absolute path. Voratiq calls this once during catalog loading when `VORATIQ_AGENT_GEMINI_BINARY` is not set.

If you prefer a project-local install, use `npx @google/gemini-cli@latest …` and point `VORATIQ_AGENT_GEMINI_BINARY` to that wrapper script.

## Authentication

Gemini supports multiple auth flows:

- **API key**: export `GEMINI_API_KEY="<secret>"`.
- **OAuth**: run `gemini auth login` once; credentials are stored under `~/.config/gemini/`.
- **Vertex AI**: export `GOOGLE_GENAI_USE_VERTEXAI="true"` and configure `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`.

The CLI exits with code `0` on success and uses non-zero exit codes (for example `41` for invalid auth and `42` for quota/rate-limit issues). Voratiq surfaces these codes as `AgentProcessError` messages.

## Headless Usage

- Invoke the generator subcommand with a prompt flag: `gemini generate --model gemini-1.5-flash --prompt "Implement the spec" --output-format json`.
- You can also pipe the prompt through stdin: `printf '%s\n' "Implement the spec" | CI=1 gemini generate --model gemini-1.5-pro --output-format json`.
- Set `CI=1` (or any truthy `CI_*` variable) in the environment to guarantee the CLI never switches into interactive chat mode.
- `--output-format json` keeps stdout machine-friendly for post-processing and is recommended when running inside Voratiq.

## Voratiq Configuration

Voratiq discovers Gemini automatically when both requirements are met:

- Environment variables:
  - `VORATIQ_AGENT_GEMINI_MODEL` (required) – the Gemini model id, e.g. `gemini-1.5-flash`.
  - `VORATIQ_AGENT_GEMINI_BINARY` (optional) – absolute path to the CLI; fallback is `command -v gemini`.
  - `VORATIQ_AGENT_GEMINI_ARGV` (optional) – JSON array of extra CLI flags, appended after Voratiq's defaults.
- Defaults injected by Voratiq: `generate --model {{MODEL}} --prompt --output-format json`. The runtime fills `{{MODEL}}` and replaces `--prompt` with the synthesized spec prompt.

Example shell configuration:

```bash
export VORATIQ_AGENT_GEMINI_MODEL="gemini-1.5-flash"
export VORATIQ_AGENT_GEMINI_ARGV='["--safety-settings","strict"]'
# Optional override:
# export VORATIQ_AGENT_GEMINI_BINARY="/usr/local/bin/gemini"
```

Run all agents, including Gemini:

```bash
voratiq run --spec specs/example.md
```

If you want Gemini-only runs, set `VORATIQ_AGENT_CLAUDE_CODE_BINARY` / `VORATIQ_AGENT_CODEX_BINARY` to blank strings before invoking `voratiq run`, or update your workspace presets as shown in `.voratiq/config.json`.

## Troubleshooting

- Ensure `CI=1` is exported in automated systems to avoid hangs caused by interactive prompts.
- Capture stderr when diagnosing failures; the CLI prints actionable messages there (for example `quota exceeded`).
- Re-run `gemini auth login` or refresh API keys when exit code `41` appears.
- Use `--trace` in `VORATIQ_AGENT_GEMINI_ARGV` to request verbose logging from the CLI when debugging.
