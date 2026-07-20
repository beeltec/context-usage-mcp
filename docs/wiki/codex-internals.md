---
type: Reference
title: Codex CLI Internals — Session & Token Exposure
description: What Codex exposes to MCP servers, where rollout files live, and the token_count schema.
tags: [codex, mcp, rollouts, tokens]
timestamp: 2026-07-20T00:00:00Z
---

# What an MCP server can see about the calling Codex session

Codex does **not** pass a project-dir or session-id environment variable to MCP servers
(no analog to Claude Code's `CLAUDE_PROJECT_DIR`). Confirmed from source:

- The stdio server is spawned with `.env_clear()` then a fixed allow-list of env vars
  (`HOME, LOGNAME, PATH, SHELL, USER, __CF_USER_TEXT_ENCODING, LANG, LC_ALL, TERM, TMPDIR, TZ`
  on Unix) plus any vars named in the server's `config.toml` entry.
  (`codex-rs/rmcp-client/src/utils.rs`, `create_env_for_mcp_server` / `DEFAULT_ENV_VARS`.)
- The server's **working directory defaults to the Codex session's project cwd** when the
  config omits `cwd` (`stdio_server_launcher.rs` → `local_stdio_fallback_cwd()` →
  session/turn cwd in `core/src/session/{session,mcp}.rs`).
- The MCP client does **not** advertise the `roots` capability and implements no `roots/list`
  handler (`codex-rs/codex-mcp/src/rmcp_client.rs` sets only `elicitation`;
  `logging_client_handler.rs` has no roots override) — so a server cannot obtain the workspace
  dir via roots either.

Consequence: the project directory is available **only implicitly, as `process.cwd()`**. This is
the substitute for `CLAUDE_PROJECT_DIR`.

# Where rollout files live

Path pattern: `~/.codex/sessions/YYYY/MM/DD/rollout-<id>.jsonl` — partitioned by **date**, not by
project. Root movable via `CODEX_HOME` (analog of `CLAUDE_CONFIG_DIR`).

Each rollout's **first line** is a `session_meta` item recording the session's `cwd`, so the
current session is found by: scan recent day-folders → read each candidate's `session_meta.cwd` →
keep those matching `process.cwd()` → pick freshest by mtime.

# Rollout JSONL envelope

Each line (`RolloutLine`, `codex-rs/protocol/src/protocol.rs`):

```json
{ "timestamp": "<ISO-8601>", "ordinal": 42, "type": "<item-type>", "payload": { ... } }
```

`RolloutItem` uses adjacent tagging (`tag="type"`, `content="payload"`). Relevant item types:
`session_meta` (has `cwd`, `session_id`, model/provider), `event_msg`, `turn_context`, etc.

# Token usage in the rollout — `token_count`

A `token_count` event is an `event_msg` whose payload carries a `TokenUsageInfo`:

```json
{ "type": "event_msg",
  "payload": { "type": "token_count",
    "info": {
      "total_token_usage": { "input_tokens": 0, "cached_input_tokens": 0,
        "cache_write_input_tokens": 0, "output_tokens": 0,
        "reasoning_output_tokens": 0, "total_tokens": 0 },
      "last_token_usage":  { "...": "same shape" },
      "model_context_window": 272000 },
    "rate_limits": { } } }
```

- `total_token_usage` is **cumulative** across the whole session (`add_assign` each turn).
- `last_token_usage` is the **most recent single turn** (overwritten each turn) — this is the
  analog of Claude's per-message `usage` block and the correct source for current context size.
- `cache_write_input_tokens` is `#[serde(default)]` — **absent in older rollouts** (defaults to 0).
- `token_count` was added ~2025-09; fields have already churned — same "internal format" fragility
  risk as the Claude transcript.

**Open verification item (before coding):** whether `cached_input_tokens` is *additive to*
`input_tokens` (like Claude — sum is correct) or a *subset* (would double-count). Research
indicates additive/separate; confirm in source.

# Field mapping to the shared output shape

| Codex (`last_token_usage`) | Shared breakdown field |
|---|---|
| `input_tokens` | `input_tokens` |
| `cached_input_tokens` | `cache_read_input_tokens` |
| `cache_write_input_tokens` | `cache_creation_input_tokens` |
| `output_tokens` + `reasoning_output_tokens` | `output_tokens` |

`context_tokens = input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
(same formula as Claude; output/reasoning excluded). `model_context_window` is **ignored** (strict
output-shape parity with the Claude host — no percentage).

# Citations

- openai/codex `codex-rs/protocol/src/protocol.rs` (TokenUsage, TokenUsageInfo, TokenCountEvent, RolloutLine, SessionMeta)
- openai/codex `codex-rs/rmcp-client/src/{stdio_server_launcher,utils,logging_client_handler}.rs`
- openai/codex `codex-rs/codex-mcp/src/rmcp_client.rs`
- https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- https://developers.openai.com/codex/config-reference
