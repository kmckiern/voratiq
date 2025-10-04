# Claude Code

- Install the latest AnthropIc CLI and log in (`claude auth login`).
- Set `VORATIQ_AGENT_CLAUDE_CODE_BINARY` to the CLI path (for example `/usr/local/bin/claude`).
- Choose a model via `VORATIQ_AGENT_CLAUDE_CODE_MODEL` (e.g. `claude-sonnet-4-5-20250929`).
- Optional: add `VORATIQ_AGENT_CLAUDE_CODE_ARGV='["--temperature","0.2"]'` if you need extra flags—the headless defaults are already provided.

Voratiq exports `VORATIQ_AGENT_ID` and `VORATIQ_AGENT_MODEL` to the agent process; use them in custom wrappers if you need conditional logic.
