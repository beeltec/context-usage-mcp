---
type: Overview
title: Overview & Decisions
description: Goal, architecture, and locked decisions for the context-length MCP server.
tags: [design, decisions, mcp]
timestamp: 2026-07-20T00:00:00Z
---

# Goal

Provide an MCP tool the agent can call after each task to learn the current Claude Code
session's token usage, so it can branch its behavior when context grows large.

# Architecture

Because MCP servers receive no session data (see [internals](/docs/wiki/claude-code-internals.md)),
the server reads the session **transcript JSONL directly**:

1. Derive the project folder from `CLAUDE_PROJECT_DIR` (non-alphanumerics → `-`).
2. Pick the **most-recently-modified `*.jsonl`** in that folder = the current session
   (its transcript is being actively written while the tool is called mid-turn).
3. Scan backward for the last assistant message containing a `usage` block.
4. Sum `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` → `context_tokens`.
5. Return total + breakdown + metadata, or a structured "unavailable" result.

# Locked decisions

| Area | Decision |
|------|----------|
| Runtime | TypeScript / Node |
| Transport | stdio (local subprocess) |
| Threshold logic | Server returns **raw numbers only**; agent decides "too long" in its prompt |
| Data source | **Parse transcript JSONL directly** (self-contained; accepts format-fragility risk) |
| Session pick | Freshest `*.jsonl` in the project dir |
| Window size | **Raw tokens only** — no percentage, no window detection |
| Output fields | `context_tokens` total **+** full breakdown (input/cache_creation/cache_read/output) |
| Metadata | `session_id`, `model`, and the source message `timestamp` |
| Error handling | Structured `{available:false, reason}` result with null numbers (never throws for missing data) |
| Tool surface | One tool: `get_context_usage` (no arguments) |
| Response format | JSON text block **+** `structuredContent` with declared `outputSchema` |
| Distribution | Local build + `claude mcp add` (user scope); may publish later |
| Testing | Unit-test the parser only, against fixture JSONL (normal / post-compaction / no-usage) |
| Build tooling | npm + `tsc`, strict + `noUncheckedIndexedAccess`; Node built-in test runner + tsx |

# Codex support (planned)

Extend the same server to also run under **OpenAI Codex CLI**, whose internals differ (see
[Codex internals](/docs/wiki/codex-internals.md)). Decided in the 2026-07-20 discussion; **not yet
implemented**.

| Area | Decision |
|------|----------|
| Packaging | **One codebase, host-adapter layer.** Shared `index.ts` MCP wiring; host-specific discovery + parser behind a common interface. |
| Host detection | **Auto-detect + override.** `CLAUDE_PROJECT_DIR` → Claude; `CODEX_HOME`/`~/.codex/sessions` → Codex. Explicit flag/env override wins. |
| Session pick (Codex) | **cwd-match + freshest, bounded scan** of recent day-folders. |
| Scan window | **Today + yesterday first**; widen (up to ~7 days) only if no cwd-match found. |
| Token source | **`last_token_usage`** (per-turn) = current context. Not cumulative `total_token_usage`. |
| Window size | **Strict parity** — ignore `model_context_window`, no percentage. Output shape identical across hosts. |
| Field mapping | `cached`→`cache_read`, `cache_write`→`cache_creation`, `input`→`input`, `output`+`reasoning`→`output`. `context_tokens = input + cache_read + cache_creation`. |
| Naming | **Rename** package/repo → `context-usage-mcp` (tool stays `get_context_usage`). |
| Testing | Unit-test Codex parser (normal / older-no-`cache_write` / no-`token_count`-yet / cumulative-vs-last) **+** host-detection (pure fn). Discovery untested. |
| Distribution | Local build; document Codex registration (`config.toml` `[mcp_servers.*]` / `codex mcp add`); **defer npm**. |
| Project dir | **No override** — rely on `process.cwd()`; document "don't set a custom server `cwd`." |

Carried over unchanged: single `get_context_usage` tool, structured `{available:false, reason}`
(never throws) with Codex-specific reason text, JSON text + `structuredContent`.

**Pre-coding verification:** confirm in Codex source whether `cached_input_tokens` is additive to
`input_tokens` (sum correct) or a subset (double-count risk).

# Constraints

- Strict TypeScript, no `any` (per user global guidelines).
- Minimal, non-overengineered unit test.

# Known risks

- Transcript format is undocumented/internal — may break on Claude Code updates.
- Freshest-file heuristic is racy if multiple sessions run concurrently in the same project.
