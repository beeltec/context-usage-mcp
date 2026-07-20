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

## 2026-07-20 — Initial implementation (Claude Code)

Built the server. Documented the `@modelcontextprotocol/sdk` v1.29.0 server
API (from context7) in [MCP TypeScript SDK](/docs/wiki/mcp-sdk-typescript.md): tool schemas are
zod **raw shapes** (not `z.object`), and `outputSchema` must be an object — so the `Reading` union
is flattened to one object with nullable fields, with `StructuredReading` derived via `z.infer` to
avoid drift. Registered at user scope; verified live against this session's transcript.

## 2026-07-20 — npx distribution decided (not yet implemented)

Ran a `/discuss` decision tree on making the MCP callable via `npx`. Decided to **publish to public
npm** as the scoped **`@beeltec/context-usage-mcp`** (short `context-usage-mcp` bin), with a
**`prepublishOnly`** typecheck→test→build gate, published from **GitHub Actions on Release
published** with **`--provenance` + `--access public`** and a tag-vs-`package.json` version guard,
first release at 0.1.0. README/config examples move to **npx-primary**. Supersedes the earlier
"defer npm" stance. Manual prerequisites: npm token → `NPM_TOKEN` secret, and cutting the first
Release. All decisions recorded in [overview](/docs/wiki/overview.md). No implementation yet.

## 2026-07-20 — Codex port landed

Ported the server to also run under **OpenAI Codex CLI** across tasks 001–005 (docs/tasks/
codex-support). Renamed the package to `context-usage-mcp`; introduced a `HostAdapter` seam with
auto-detection (`CONTEXT_USAGE_HOST` override → `CLAUDE_PROJECT_DIR` → `CODEX_HOME`/`~/.codex/sessions`
→ claude fallback); added a Codex rollout parser (per-turn `last_token_usage`) and bounded, defensive
session discovery (cwd-match + freshest over today+yesterday, widening to ~7 days). **Source
verification:** confirmed `cached_input_tokens` is a *subset* of `input_tokens`
(`TokenUsage::non_cached_input` subtracts it), so the mapping subtracts cached to keep the shared
breakdown disjoint and avoid double-counting — recorded in [Codex internals](/docs/wiki/codex-internals.md).
Verified live against a real **Codex CLI 0.144.6** session (discovered the freshest cwd-matching
rollout; `context_tokens` matched an independent computation) and re-verified the Claude path
unchanged. Output shape is identical across hosts.
