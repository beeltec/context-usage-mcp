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

# Constraints

- Strict TypeScript, no `any` (per user global guidelines).
- Minimal, non-overengineered unit test.

# Known risks

- Transcript format is undocumented/internal — may break on Claude Code updates.
- Freshest-file heuristic is racy if multiple sessions run concurrently in the same project.
