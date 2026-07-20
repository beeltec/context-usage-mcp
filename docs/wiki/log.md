---
type: Log
title: Decision Log
description: Chronological history of decisions.
timestamp: 2026-07-20T00:00:00Z
---

# Log

## 2026-07-20 — Initial design discussion

Resolved full decision tree for the context-length MCP server. Researched Claude Code
internals: confirmed stdio MCP servers get only `CLAUDE_PROJECT_DIR`, no session/token data.
Chose a self-contained transcript-JSONL reader over the more robust statusline-sidecar
approach. All decisions recorded in [overview](/docs/wiki/overview.md).

## 2026-07-20 — Codex port research & design

Researched whether the same functionality is feasible under OpenAI Codex CLI. Source-confirmed
(openai/codex): Codex supports MCP, stores rollout JSONL under `~/.codex/sessions/YYYY/MM/DD/`,
passes **no** project/session env var and does **not** advertise MCP `roots` — but spawns the
server with cwd = project dir, and rollout `session_meta` records `cwd`. Token data lives in
`token_count` events (`last_token_usage` per-turn vs cumulative `total_token_usage`). Full
findings in [Codex internals](/docs/wiki/codex-internals.md). Ran a `/discuss` decision tree; all
Codex-support decisions recorded in [overview](/docs/wiki/overview.md). No implementation yet.

## 2026-07-20 — Implementation

Built the server across tasks 001–005. Documented the `@modelcontextprotocol/sdk` v1.29.0 server
API (from context7) in [MCP TypeScript SDK](/docs/wiki/mcp-sdk-typescript.md): tool schemas are
zod **raw shapes** (not `z.object`), and `outputSchema` must be an object — so the `Reading` union
is flattened to one object with nullable fields, with `StructuredReading` derived via `z.infer` to
avoid drift. Registered at user scope; verified live against this session's transcript.
