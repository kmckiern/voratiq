# Google Gemini

- Install the CLI (`npm install -g @google/gemini-cli`) and authenticate (API key export or `gemini auth login`).
- Set `VORATIQ_AGENT_GEMINI_BINARY` to the CLI path and choose a model via `VORATIQ_AGENT_GEMINI_MODEL` (e.g. `gemini-2.5-pro`).
- Optional extras go in `VORATIQ_AGENT_GEMINI_ARGV`; the default argv already enables `generate --output-format json --model {{MODEL}}`.
- Export `CI=1` (or any `CI_*`) in headless environments to prevent interactive prompts.

Common issues: exit code `41` indicates auth failure (refresh credentials); quota errors surface on stderr—Voratiq captures them in the agent’s `stderr.log`.
