#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseReading } from "./parser.js";
import { findFreshestTranscript } from "./session.js";
import type { Reading, Usage } from "./types.js";

/**
 * MCP `outputSchema` must be an object schema, so the `Reading` union is flattened into a single
 * object: on the unavailable path the numeric fields are `null` and `reason` is set; on the
 * available path `reason` is `null`. This matches the locked "null numbers when unavailable" shape.
 */
const outputShape = {
  available: z.boolean(),
  context_tokens: z.number().nullable(),
  breakdown: z
    .object({
      input_tokens: z.number(),
      cache_creation_input_tokens: z.number(),
      cache_read_input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .nullable(),
  session_id: z.string().nullable(),
  model: z.string().nullable(),
  timestamp: z.string().nullable(),
  reason: z.string().nullable(),
};

type StructuredReading = {
  readonly available: boolean;
  readonly context_tokens: number | null;
  readonly breakdown: Usage | null;
  readonly session_id: string | null;
  readonly model: string | null;
  readonly timestamp: string | null;
  readonly reason: string | null;
};

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve the freshest transcript, read it, and parse it into a `Reading`. Every failure mode —
 * file selection, IO, parsing — is converted into a structured unavailable result; this never
 * throws, so the tool cannot crash the agent's flow.
 */
function readCurrentUsage(): Reading {
  let path: string | null;
  try {
    path = findFreshestTranscript();
  } catch (error) {
    return {
      available: false,
      reason: `failed to locate transcript: ${errorMessage(error)}`,
    };
  }

  if (path === null) {
    return {
      available: false,
      reason: "no transcript file found for the current project",
    };
  }

  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    return {
      available: false,
      reason: `failed to read transcript: ${errorMessage(error)}`,
    };
  }

  return parseReading(contents);
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
    outputSchema: outputShape,
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
