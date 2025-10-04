# Agent Configuration

Voratiq treats every agent the same way: you supply the binary path and model id, and the CLI injects the headless argv template. Optional extras go in `_ARGV` if you need to append flags.

| Env var                     | Required | Description                                                       |
| --------------------------- | -------- | ----------------------------------------------------------------- |
| `VORATIQ_AGENT_<ID>_BINARY` | ✅       | Absolute path to the agent CLI.                                   |
| `VORATIQ_AGENT_<ID>_MODEL`  | ✅       | Model identifier passed to the CLI and recorded in run logs.      |
| `VORATIQ_AGENT_<ID>_ARGV`   | Optional | JSON array of additional flags appended after Voratiq’s defaults. |

Built-in defaults keep the agents in headless mode:

- `claude`: `--model {{MODEL}} --output-format json --permission-mode acceptEdits --allowedTools Bash,Read,Edit -p`
- `codex`: `exec --model {{MODEL}} --sandbox workspace-write --experimental-json --full-auto -c mcp_servers={}`
- `gemini`: `generate --model {{MODEL}} --output-format json --approval-mode auto_edit`

See the per-agent notes for prerequisites and authentication steps:

- [Claude Code](./claude.md)
- [OpenAI Codex](./codex.md)
- [Google Gemini](./gemini.md)
