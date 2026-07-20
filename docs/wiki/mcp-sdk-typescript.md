---
type: Reference
title: MCP TypeScript SDK — Server API
description: How this project uses @modelcontextprotocol/sdk to build a stdio MCP server with a structured-output tool.
tags: [mcp, sdk, typescript, stdio, tools]
timestamp: 2026-07-20T00:00:00Z
---

# Package & version

`@modelcontextprotocol/sdk` **v1.29.0**. Facts below verified against the SDK docs (via context7)
and the installed package.

# Imports (subpath, ESM)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

# Registering a tool

```ts
const server = new McpServer({ name: "context-length", version: "0.1.0" });

server.registerTool(
  "get_context_usage",
  {
    title: "Get context usage",
    description: "…",
    inputSchema: {},              // empty raw shape = no arguments
    outputSchema: outputSchema.shape,
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  }),
);
```

## Schemas are Zod RAW SHAPES, not `z.object(...)`

`inputSchema` and `outputSchema` take a **raw shape** — a plain object of zod types
(`{ name: z.string() }`), or `{}` for no input. They are **not** a `z.object(...)`. If you keep a
`z.object(...)` as the single source of truth, pass its **`.shape`** to `registerTool`.

## outputSchema must describe an OBJECT

MCP output schemas must be object schemas. A discriminated union (e.g. `available: true | false`)
cannot be the top-level output schema — **flatten it to one object** with `nullable()` fields for
the variant that is absent. Deriving the TS result type with `z.infer<typeof outputSchema>` keeps
the schema and the type from drifting.

## Structured output contract

Return **both** `content` (human-readable, e.g. a JSON `text` block) and `structuredContent`. The
SDK **validates `structuredContent` against `outputSchema` before the result leaves the server** and
advertises the derived JSON Schema in `tools/list`, so a mismatch throws server-side.

# Starting the stdio server

```ts
const transport = new StdioServerTransport();
await server.connect(transport);
```

Register with Claude Code: `claude mcp add --scope user <name> -- node /abs/path/dist/index.js`.
MCP servers load at **session start**, so start a new session before calling a freshly-added tool.

# Citations

- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md
- Installed: `@modelcontextprotocol/sdk@1.29.0`
