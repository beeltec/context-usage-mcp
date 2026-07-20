---
type: Reference
title: Claude Code Internals — Session & Token Exposure
description: What session/token data Claude Code exposes to MCP servers, and where transcripts live.
tags: [claude-code, mcp, transcripts, tokens]
timestamp: 2026-07-20T00:00:00Z
---

# What an MCP server can see about the calling session

For **stdio** MCP servers, Claude Code sets exactly ONE relevant environment variable:

- `CLAUDE_PROJECT_DIR` — the stable project root (session launch directory, not affected by `/cd`).

It does **not** pass: session id, transcript path, cwd, or any token-usage info.
(HTTP/SSE servers get even less — only standard HTTP request semantics.)

Consequence: the server cannot be *told* the current usage; it must read it indirectly.

# Where transcripts live

Path pattern: `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is the
working directory path with **non-alphanumeric characters replaced by `-`**.

- Root is movable via `CLAUDE_CONFIG_DIR` (instead of `~/.claude`).
- Retention: `cleanupPeriodDays` in settings.json (default 30 days).

# Token usage in the transcript

Assistant messages carry a `usage` block with:
`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`.

- The **actual context fed to the model** ≈ `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
- These are **current** (from the most recent API response), not cumulative; reset on `/clear`/`/compact`.
- The docs warn the transcript JSONL is an **internal format that can change between versions** —
  parsing it directly is accepted here as a known fragility risk.

# Statusline (the robust source we chose NOT to use)

Statusline scripts receive fully-computed context data on stdin (`context_window.used_percentage`,
`context_window_size`, `current_usage`, plus `session_id`, `transcript_path`). This was the more
robust option but was rejected in favor of a zero-setup, self-contained transcript reader.

# Citations

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/context-window
