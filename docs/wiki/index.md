---
type: Wiki Index
title: context-usage-mcp Wiki
description: Durable project knowledge for the context-usage MCP server.
timestamp: 2026-07-20T00:00:00Z
---

# context-usage-mcp

An MCP server that reports the current session's token/context usage under both Claude Code
and OpenAI Codex CLI, so an agent can check after each task whether context has exceeded a
threshold and behave differently.

## Pages

- [Overview & Decisions](/docs/wiki/overview.md) — goal, architecture, and all locked decisions.
- [Claude Code Internals](/docs/wiki/claude-code-internals.md) — how session/token data is (and isn't) exposed.
- [Codex Internals](/docs/wiki/codex-internals.md) — Codex rollout layout, `token_count` schema, and what MCP servers can see (planned port).
- [MCP TypeScript SDK — Server API](/docs/wiki/mcp-sdk-typescript.md) — registerTool, raw-shape schemas, structured output, stdio.
- [Log](/docs/wiki/log.md) — chronological decision history.
