# OpenAI Codex

- Install the Codex CLI and authenticate (`codex auth login`).
- Point `VORATIQ_AGENT_CODEX_BINARY` to the executable.
- Pick a model via `VORATIQ_AGENT_CODEX_MODEL` (for example `gpt-5-codex`).
- Append extra flags with `VORATIQ_AGENT_CODEX_ARGV` only when needed; Voratiq already includes the sandboxed, JSON-output template.

If the CLI requires OpenAI credentials, ensure the relevant environment variables (such as `OPENAI_API_KEY`) are exported before invoking `voratiq run`.
