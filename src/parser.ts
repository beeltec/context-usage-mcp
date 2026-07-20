import { z } from "zod";
import { contextTokens, type Reading, type Usage } from "./types.js";

/**
 * Usage sub-fields are all optional; missing ones default to 0. Extra fields are tolerated.
 */
const usageSchema = z
  .object({
    input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
  })
  .passthrough();

/**
 * A transcript line carrying an assistant message. Only the fields we need are validated;
 * unknown/extra fields are tolerated. The presence of `message.usage` marks a usage-bearing line.
 */
const assistantLineSchema = z
  .object({
    type: z.string().optional(),
    timestamp: z.string().optional(),
    sessionId: z.string().optional(),
    message: z
      .object({
        role: z.string().optional(),
        model: z.string().optional(),
        usage: usageSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type AssistantLine = z.infer<typeof assistantLineSchema>;

/**
 * True when the parsed line is an assistant message that carries a usage block.
 */
function hasUsage(line: AssistantLine): line is AssistantLine & {
  readonly message: { readonly usage: z.infer<typeof usageSchema> };
} {
  if (line.message?.usage === undefined) {
    return false;
  }
  // Only assistant messages carry usage; when a role/type is present, require it to be assistant.
  const isAssistant =
    line.type === undefined ? true : line.type === "assistant";
  const roleOk =
    line.message.role === undefined ? true : line.message.role === "assistant";
  return isAssistant && roleOk;
}

function toBreakdown(usage: z.infer<typeof usageSchema>): Usage {
  return {
    input_tokens: usage.input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  };
}

/**
 * Parse the text contents of a session transcript (JSONL) into a token-usage `Reading`.
 *
 * Pure function — no filesystem access. Parses line-by-line, tolerates malformed lines, and
 * scans backward for the last assistant message carrying a `usage` block. Never throws for
 * missing or malformed data; returns a structured `{ available: false, reason }` instead.
 */
export function parseReading(contents: string): Reading {
  const lines = contents.split("\n");
  const hasContent = lines.some((line) => line.trim().length > 0);
  if (!hasContent) {
    return { available: false, reason: "transcript file is empty" };
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    if (raw === undefined || raw.trim().length === 0) {
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue; // tolerate malformed lines
    }

    const parsed = assistantLineSchema.safeParse(json);
    if (!parsed.success || !hasUsage(parsed.data)) {
      continue;
    }

    const line = parsed.data;
    const breakdown = toBreakdown(line.message.usage);

    return {
      available: true,
      context_tokens: contextTokens(breakdown),
      breakdown,
      session_id: line.sessionId ?? null,
      model: line.message.model ?? null,
      timestamp: line.timestamp ?? null,
    };
  }

  return {
    available: false,
    reason: "no assistant message with a usage block found in transcript",
  };
}
