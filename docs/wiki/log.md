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
