# context-usage-mcp

A tiny [Model Context Protocol](https://modelcontextprotocol.io) server (TypeScript/Node, stdio)
that exposes a single tool, **`get_context_usage`**, reporting the current session's **raw token
usage** — so an agent can check after each task whether context has grown large and branch its
behavior on an absolute threshold. Runs under both **Claude Code** and **OpenAI Codex CLI**, reading
each host's own session transcript/rollout behind an auto-detected host-adapter layer.

## What it does

Neither host hands an stdio MCP server the live token counts, so this server reads usage
**indirectly** from the host's own on-disk session file, behind an auto-detected host-adapter layer.
The output shape is identical across hosts.

**Claude Code** passes only `CLAUDE_PROJECT_DIR` (no session id, transcript path, or counts):

1. Derive the project folder from `CLAUDE_PROJECT_DIR` (non-alphanumerics → `-`).
2. Pick the **most-recently-modified `*.jsonl`** in `~/.claude/projects/<folder>/` as the current
   session (its transcript is being written while the tool is called).
3. Scan **backward** for the last assistant message carrying a `usage` block.
4. Sum `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` → `context_tokens`.

The `~/.claude` root can be relocated with `CLAUDE_CONFIG_DIR`.

**OpenAI Codex CLI** passes *no* project/session env var at all, but launches the server with its
working directory set to the session's project dir. So the server uses `process.cwd()`:

1. Resolve the Codex root (`CODEX_HOME`, else `~/.codex`); rollouts live under
   `<root>/sessions/YYYY/MM/DD/rollout-*.jsonl`.
2. Scan recent day-folders (today + yesterday, widening to ~7 days), reading only each candidate's
   first `session_meta` line to match its `cwd` against `process.cwd()`; pick the **freshest** match.
3. Scan **backward** for the last `token_count` event and read its per-turn `last_token_usage`.
4. Map to the shared, disjoint breakdown. Codex's `cached_input_tokens` is a *subset* of
   `input_tokens` (verified in source), so `input` ← `input − cached`; then
   `context_tokens = input + cache_read + cache_creation` — no double-count.

Output is `output_tokens + reasoning_output_tokens`. The Codex `model_context_window` is ignored
(raw counts only, strict parity with the Claude host).

## Install

```bash
npm install
npm run build          # tsc → dist/, sets +x on dist/index.js
npm test               # parser unit tests
```

## Host detection

The server auto-detects its host: `CLAUDE_PROJECT_DIR` set → Claude Code; else `CODEX_HOME` set or
`~/.codex/sessions` present → Codex; else it falls back to Claude. Set the environment variable
`CONTEXT_USAGE_HOST=claude|codex` to force a host (the override wins over auto-detection).

## Register with Claude Code (user scope)

```bash
claude mcp add --scope user context-length -- node /Users/beeltec/workspace/test/claude-context-length-mcp/dist/index.js
```

Use the absolute path to `dist/index.js` in this repo. Verify with `claude mcp list`. Because MCP
servers are loaded at session start, start a **new** Claude Code session before calling the tool.

## Register with Codex CLI

Add an entry to `~/.codex/config.toml` (root movable with `CODEX_HOME`):

```toml
[mcp_servers.context-usage]
command = "node"
args = ["/Users/beeltec/workspace/test/claude-context-length-mcp/dist/index.js"]
```

Or use the CLI equivalent:

```bash
codex mcp add context-usage -- node /Users/beeltec/workspace/test/claude-context-length-mcp/dist/index.js
```

Use the absolute path to `dist/index.js` in this repo. **Do not set a custom `cwd` for the server**:
Codex passes no project/session identifier, so discovery relies on the server inheriting the
session's working directory via `process.cwd()`. Setting `cwd` breaks the cwd-match. MCP servers
load at session start, so start a **new** Codex session before calling the tool.

## Distribution

Local build only for now (run `npm run build` and register the absolute `dist/index.js` path).
Publishing to npm is deferred.

## The tool: `get_context_usage`

No arguments. Returns raw counts only — no percentage, no context-window detection. It may be
**unavailable** early in a session before the first model response. Both a JSON `text` block and
typed `structuredContent` (declared `outputSchema`) are returned with the same object. The shape is
identical under Claude Code and Codex.

**Available:**

```json
{
  "available": true,
  "context_tokens": 86026,
  "breakdown": {
    "input_tokens": 2,
    "cache_creation_input_tokens": 1001,
    "cache_read_input_tokens": 85023,
    "output_tokens": 225
  },
  "session_id": "…",
  "model": "claude-opus-4-8",
  "timestamp": "2026-07-20T14:17:50.751Z",
  "reason": null
}
```

**Unavailable** (never throws): numeric fields are `null` and `reason` explains why (no
transcript/rollout found, empty file, or no usage-bearing message/`token_count` event yet).

| Field | Meaning |
|-------|---------|
| `available` | Whether a reading was obtained |
| `context_tokens` | `input + cache_creation + cache_read` (the context fed back to the model) |
| `breakdown` | Raw per-category counts, including `output_tokens` |
| `session_id` / `model` / `timestamp` | Metadata from the source message/event |
| `reason` | Why the reading is unavailable (`null` when available) |

## Intended usage

The server returns **raw numbers only**; the agent decides what "too long" means. The pattern:
call `get_context_usage` after each task and branch on an absolute token threshold defined in the
agent's prompt/CLAUDE.md (e.g. wrap up or hand off when `context_tokens` exceeds a limit).

## Known risks

- **Internal file format.** Both the Claude transcript JSONL and the Codex rollout JSONL are
  undocumented internal formats that may change between host versions; parsing them directly is an
  accepted fragility.
- **Concurrent-session race.** The freshest-file heuristic (freshest `*.jsonl` for Claude; freshest
  cwd-matching `rollout-*.jsonl` for Codex) is racy if multiple sessions run in the same project at
  once — it may pick another session's file.
