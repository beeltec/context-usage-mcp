# claude-context-length-mcp

A tiny [Model Context Protocol](https://modelcontextprotocol.io) server (TypeScript/Node, stdio)
that exposes a single tool, **`get_context_usage`**, reporting the current Claude Code session's
**raw token usage** — so an agent can check after each task whether context has grown large and
branch its behavior on an absolute threshold.

## What it does

Claude Code passes an stdio MCP server only `CLAUDE_PROJECT_DIR` — no session id, transcript path,
or token counts. So this server reads the usage **indirectly** from the session transcript:

1. Derive the project folder from `CLAUDE_PROJECT_DIR` (non-alphanumerics → `-`).
2. Pick the **most-recently-modified `*.jsonl`** in `~/.claude/projects/<folder>/` as the current
   session (its transcript is being written while the tool is called).
3. Scan **backward** for the last assistant message carrying a `usage` block.
4. Sum `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` → `context_tokens`
   (output is excluded — it is not fed back into the context window).

The `~/.claude` root can be relocated with `CLAUDE_CONFIG_DIR`.

## Install

```bash
npm install
npm run build          # tsc → dist/, sets +x on dist/index.js
npm test               # parser unit tests
```

## Register with Claude Code (user scope)

```bash
claude mcp add --scope user context-length -- node /Users/beeltec/workspace/test/claude-context-length-mcp/dist/index.js
```

Use the absolute path to `dist/index.js` in this repo. Verify with `claude mcp list`. Because MCP
servers are loaded at session start, start a **new** Claude Code session before calling the tool.

## The tool: `get_context_usage`

No arguments. Returns raw counts only — no percentage, no context-window detection. It may be
**unavailable** early in a session before the first assistant response. Both a JSON `text` block and
typed `structuredContent` (declared `outputSchema`) are returned with the same object.

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

**Unavailable** (never throws): numeric fields are `null` and `reason` explains why (no transcript
found, empty file, or no assistant message with a usage block).

| Field | Meaning |
|-------|---------|
| `available` | Whether a reading was obtained |
| `context_tokens` | `input + cache_creation + cache_read` (the context fed back to the model) |
| `breakdown` | Raw per-category counts, including `output_tokens` |
| `session_id` / `model` / `timestamp` | Metadata from the source assistant message |
| `reason` | Why the reading is unavailable (`null` when available) |

## Intended usage

The server returns **raw numbers only**; the agent decides what "too long" means. The pattern:
call `get_context_usage` after each task and branch on an absolute token threshold defined in the
agent's prompt/CLAUDE.md (e.g. wrap up or hand off when `context_tokens` exceeds a limit).

## Known risks

- **Internal transcript format.** The transcript JSONL is an undocumented internal format that may
  change between Claude Code versions; parsing it directly is an accepted fragility.
- **Concurrent-session race.** The freshest-`*.jsonl` heuristic is racy if multiple sessions run in
  the same project folder at once — it may pick another session's transcript.
