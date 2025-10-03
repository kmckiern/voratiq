# Agent Configuration

Voratiq treats every agent the same way: you supply the binary path and model id, and the CLI injects the headless argv template. Optional extras go in `_ARGV` if you need to append flags.

| Env var                     | Required | Description                                                       |
| --------------------------- | -------- | ----------------------------------------------------------------- |
| `VORATIQ_AGENT_<ID>_BINARY` | ✅       | Absolute path to the agent CLI.                                   |
| `VORATIQ_AGENT_<ID>_MODEL`  | ✅       | Model identifier passed to the CLI and recorded in run logs.      |
| `VORATIQ_AGENT_<ID>_ARGV`   | Optional | JSON array of additional flags appended after Voratiq’s defaults. |

Built-in defaults keep the agents in headless mode:

- `claude-code`: `-p --output-format json --permission-mode acceptEdits --allowedTools Bash,Read,Edit --model {{MODEL}}`
- `codex`: `exec --sandbox workspace-write --experimental-json --full-auto -c mcp_servers={} --model {{MODEL}} --prompt`
- `gemini`: `generate --model {{MODEL}} --prompt --output-format json`

See the per-agent notes for prerequisites and authentication steps:

- [Claude Code](./claude-code.md)
- [OpenAI Codex](./codex.md)
- [Google Gemini](./gemini.md)
