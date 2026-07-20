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

# Codex support (implemented)

The same server also runs under **OpenAI Codex CLI**, whose internals differ (see
[Codex internals](/docs/wiki/codex-internals.md)). Decided in the 2026-07-20 discussion and
**implemented** the same day behind a host-adapter layer (`src/host.ts`, `src/codex/`); verified
live against a real Codex CLI 0.144.6 session.

| Area | Decision |
|------|----------|
| Packaging | **One codebase, host-adapter layer.** Shared `index.ts` MCP wiring; host-specific discovery + parser behind a common interface. |
| Host detection | **Auto-detect + override.** `CLAUDE_PROJECT_DIR` → Claude; `CODEX_HOME`/`~/.codex/sessions` → Codex. Explicit flag/env override wins. |
| Session pick (Codex) | **cwd-match + freshest, bounded scan** of recent day-folders. |
| Scan window | **Today + yesterday first**; widen (up to ~7 days) only if no cwd-match found. |
| Token source | **`last_token_usage`** (per-turn) = current context. Not cumulative `total_token_usage`. |
| Window size | **Strict parity** — ignore `model_context_window`, no percentage. Output shape identical across hosts. |
| Field mapping | `cached`→`cache_read`, `cache_write`→`cache_creation`, `output`+`reasoning`→`output`. Codex `cached_input_tokens` is a **subset** of `input_tokens` (source-verified — `TokenUsage::non_cached_input` subtracts it), so shared `input`←`input − cached` (clamped ≥ 0) to stay disjoint like Claude. `context_tokens = input + cache_read + cache_creation`. |
| Naming | **Rename** package/repo → `context-usage-mcp` (tool stays `get_context_usage`). |
| Testing | Unit-test Codex parser (normal / older-no-`cache_write` / no-`token_count`-yet / cumulative-vs-last) **+** host-detection (pure fn). Discovery untested. |
| Distribution | Local build; document Codex registration (`config.toml` `[mcp_servers.*]` / `codex mcp add`); **defer npm**. |
| Project dir | **No override** — rely on `process.cwd()`; document "don't set a custom server `cwd`." |

Carried over unchanged: single `get_context_usage` tool, structured `{available:false, reason}`
(never throws) with Codex-specific reason text, JSON text + `structuredContent`.

**Pre-coding verification — RESOLVED (2026-07-20):** Codex `cached_input_tokens` is a *subset* of
`input_tokens` (confirmed via `TokenUsage::non_cached_input`); the mapping subtracts it (shared
`input`←`input − cached`) to avoid double-counting. See [Codex internals](/docs/wiki/codex-internals.md).

# Distribution & publishing — npx (decided 2026-07-20)

Supersedes the earlier "may publish later" / "defer npm" stance in the tables above. The MCP
becomes installable and runnable via `npx`, wired into Claude Code / Codex without a local checkout.

| Area | Decision |
|------|----------|
| Distribution | **Publish to public npm.** Consumed via `npx -y @beeltec/context-usage-mcp`. |
| Package name | **Scoped `@beeltec/context-usage-mcp`** (unscoped `context-usage-mcp` is free but scoping asserts ownership). |
| Bin name | Keep the short **`context-usage-mcp`** executable (bin key differs from the scoped package name). |
| Build/packaging | `dist/` stays **gitignored**; `files: ["dist"]` keeps the tarball lean. |
| Build gate | Add **`prepublishOnly`** = typecheck → tests → build, so a broken build can't be published. |
| Publish method | **GitHub Actions**, publishing with **`--provenance`** (`id-token: write`) + `--access public` (required for scoped). |
| Release trigger | **GitHub Release published** (release notes as the gate; the release creates the tag). |
| Version guard | Workflow **fails if the release tag ≠ `package.json` version**. |
| CI runtime | Node 20. |
| First release | Publish current **0.1.0** (tag `v0.1.0`). |
| Docs | README + Claude Code/Codex MCP config examples: **npx is the primary path**; short "from source / local dev" note kept below. |

**Manual steps (out of the agent's reach):** create the npm automation token, add it as the
`NPM_TOKEN` repo secret, run any first-time `npm login`, and cut the first GitHub Release.

# Constraints

- Strict TypeScript, no `any` (per user global guidelines).
- Minimal, non-overengineered unit test.

# Known risks

- Transcript format is undocumented/internal — may break on Claude Code updates.
- Freshest-file heuristic is racy if multiple sessions run concurrently in the same project.
