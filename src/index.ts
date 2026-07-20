#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { claudeAdapter } from "./claude/adapter.js";
import { detectHost, type Host, type HostAdapter } from "./host.js";
import type { Reading, Usage } from "./types.js";
import { errorMessage } from "./util.js";

const breakdownSchema = z.object({
  input_tokens: z.number(),
  cache_creation_input_tokens: z.number(),
  cache_read_input_tokens: z.number(),
  output_tokens: z.number(),
}) satisfies z.ZodType<Usage>;

/**
 * MCP `outputSchema` must be an object schema, so the `Reading` union is flattened into a single
 * object: on the unavailable path the numeric fields are `null` and `reason` is set; on the
 * available path `reason` is `null`. This matches the locked "null numbers when unavailable" shape.
 *
 * This zod object is the single source of truth: its `.shape` is handed to `registerTool` as the
 * output schema, and `StructuredReading` is derived from it via `z.infer` so the two cannot drift.
 */
const outputSchema = z.object({
  available: z.boolean(),
  context_tokens: z.number().nullable(),
  breakdown: breakdownSchema.nullable(),
  session_id: z.string().nullable(),
  model: z.string().nullable(),
  timestamp: z.string().nullable(),
  reason: z.string().nullable(),
});

type StructuredReading = z.infer<typeof outputSchema>;

function toStructured(reading: Reading): StructuredReading {
  if (reading.available) {
    return {
      available: true,
      context_tokens: reading.context_tokens,
      breakdown: reading.breakdown,
      session_id: reading.session_id,
      model: reading.model,
      timestamp: reading.timestamp,
      reason: null,
    };
  }
  return {
    available: false,
    context_tokens: null,
    breakdown: null,
    session_id: null,
    model: null,
    timestamp: null,
    reason: reading.reason,
  };
}

/**
 * Placeholder Codex adapter. The real implementation (discovery + rollout parser) is wired in
 * task 005; until then `"codex"` resolves here so dispatch stays exhaustive and never throws.
 */
const codexAdapterStub: HostAdapter = {
  readCurrentUsage: () => ({
    available: false,
    reason: "codex host adapter is not yet implemented",
  }),
};

/**
 * Map a detected host to its adapter. The `never` fallthrough forces every member of the `Host`
 * union to be handled — adding a host without an adapter is a compile error.
 */
function selectAdapter(host: Host): HostAdapter {
  switch (host) {
    case "claude":
      return claudeAdapter;
    case "codex":
      return codexAdapterStub;
    default: {
      const exhaustive: never = host;
      return exhaustive;
    }
  }
}

/**
 * Detect the host and delegate to its adapter. The adapter contract guarantees no throw, so this
 * cannot crash the agent's flow.
 */
function readCurrentUsage(): Reading {
  return selectAdapter(detectHost()).readCurrentUsage();
}

const server = new McpServer({
  name: "context-length",
  version: "0.1.0",
});

server.registerTool(
  "get_context_usage",
  {
    title: "Get context usage",
    description:
      "Reports the current Claude Code session's raw token usage, read directly from the " +
      "session transcript. Returns raw counts only — context_tokens (input + cache_creation + " +
      "cache_read) plus a full breakdown and session metadata (session_id, model, timestamp) — " +
      "with no percentage or context-window detection. May be unavailable early in a session " +
      "before the first assistant response; then it returns { available: false, reason } " +
      "instead of failing.",
    inputSchema: {},
    outputSchema: outputSchema.shape,
  },
  async () => {
    const structured = toStructured(readCurrentUsage());
    return {
      content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
      structuredContent: structured,
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`fatal: ${errorMessage(error)}\n`);
  process.exit(1);
});
