import { z } from "zod";
import type { Reading, Usage } from "../types.js";

/**
 * Codex `TokenUsage` sub-fields — all optional, missing ones default to 0, extras tolerated.
 * Mirrors `codex-rs/protocol/src/protocol.rs::TokenUsage`.
 */
const tokenUsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    cached_input_tokens: z.number().optional(),
    cache_write_input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    reasoning_output_tokens: z.number().optional(),
  })
  .passthrough();

type CodexUsage = z.infer<typeof tokenUsageSchema>;

/**
 * A single rollout JSONL line. Codex uses adjacent tagging (`type` + `payload`); only the fields
 * we read are validated, everything else is tolerated. `payload` is kept loose because its shape
 * depends on `type`; per-type fields are pulled out with dedicated helpers below.
 */
const rolloutLineSchema = z
  .object({
    timestamp: z.string().optional(),
    type: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

type RolloutLine = z.infer<typeof rolloutLineSchema>;

/** The `info` object inside a `token_count` event; `null` early in a session. */
const tokenCountInfoSchema = z
  .object({
    last_token_usage: tokenUsageSchema.optional(),
    total_token_usage: tokenUsageSchema.optional(),
  })
  .passthrough();

function payloadString(
  payload: RolloutLine["payload"],
  key: string,
): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Map Codex per-turn usage to the shared, **disjoint** breakdown.
 *
 * Source-verified (`TokenUsage::non_cached_input`): Codex `cached_input_tokens` is a *subset* of
 * `input_tokens`, so we subtract it to recover the non-cached input. This keeps the three input
 * fields disjoint — exactly like Claude's Anthropic-API usage — so `context_tokens` sums them
 * without double-counting the cache.
 */
function toBreakdown(usage: CodexUsage): Usage {
  const codexInput = usage.input_tokens ?? 0;
  const cached = usage.cached_input_tokens ?? 0;
  const cacheWrite = usage.cache_write_input_tokens ?? 0;
  const output = (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0);
  return {
    input_tokens: Math.max(0, codexInput - cached),
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: cacheWrite,
    output_tokens: output,
  };
}

type ParsedLine = { readonly line: RolloutLine; readonly index: number };

/**
 * Parse the text of a Codex rollout (JSONL) into a token-usage `Reading`.
 *
 * Pure function — no filesystem access. Tolerates malformed lines. Scans **backward** for the last
 * `token_count` event carrying a non-null `info`, and reads `last_token_usage` (per-turn, NOT the
 * cumulative `total_token_usage`). Metadata: `session_id` from the `session_meta` line, `model`
 * from `session_meta` if present else the latest `turn_context`, `timestamp` from the chosen
 * `token_count` line. Never throws; returns `{ available: false, reason }` for missing data.
 */
export function parseReading(contents: string): Reading {
  const rawLines = contents.split("\n");
  const parsed: ParsedLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (raw === undefined || raw.trim().length === 0) {
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue; // tolerate malformed lines
    }
    const result = rolloutLineSchema.safeParse(json);
    if (result.success) {
      parsed.push({ line: result.data, index: i });
    }
  }

  if (parsed.length === 0) {
    return { available: false, reason: "rollout file is empty" };
  }

  // Backward scan for the last token_count event with usage info.
  let sawTokenCount = false;
  let chosen: { readonly usage: CodexUsage; readonly timestamp: string | null } | null = null;
  for (let i = parsed.length - 1; i >= 0; i--) {
    const entry = parsed[i];
    if (entry === undefined) {
      continue;
    }
    const { line } = entry;
    if (payloadString(line.payload, "type") !== "token_count") {
      continue;
    }
    sawTokenCount = true;
    const rawInfo = line.payload?.["info"];
    if (rawInfo === null || rawInfo === undefined) {
      continue;
    }
    const info = tokenCountInfoSchema.safeParse(rawInfo);
    if (!info.success || info.data.last_token_usage === undefined) {
      continue;
    }
    chosen = {
      usage: info.data.last_token_usage,
      timestamp: line.timestamp ?? null,
    };
    break;
  }

  if (chosen === null) {
    return {
      available: false,
      reason: sawTokenCount
        ? "token_count event present but carries no usage info yet (info is null)"
        : "no token_count event found in rollout yet",
    };
  }

  const breakdown = toBreakdown(chosen.usage);
  const context_tokens =
    breakdown.input_tokens +
    breakdown.cache_creation_input_tokens +
    breakdown.cache_read_input_tokens;

  return {
    available: true,
    context_tokens,
    breakdown,
    session_id: findSessionId(parsed),
    model: findModel(parsed),
    timestamp: chosen.timestamp,
  };
}

/** `session_id` from the first `session_meta` line (`id`, or legacy `session_id`). */
function findSessionId(parsed: readonly ParsedLine[]): string | null {
  for (const { line } of parsed) {
    if (line.type !== "session_meta") {
      continue;
    }
    return (
      payloadString(line.payload, "id") ??
      payloadString(line.payload, "session_id") ??
      null
    );
  }
  return null;
}

/**
 * Model name: prefer `session_meta.model` (if a build records it there), else the most recent
 * `turn_context.model` (where Codex actually records the active model). Missing → `null`.
 */
function findModel(parsed: readonly ParsedLine[]): string | null {
  for (const { line } of parsed) {
    if (line.type === "session_meta") {
      const fromMeta = payloadString(line.payload, "model");
      if (fromMeta !== undefined) {
        return fromMeta;
      }
    }
  }
  for (let i = parsed.length - 1; i >= 0; i--) {
    const entry = parsed[i];
    if (entry === undefined || entry.line.type !== "turn_context") {
      continue;
    }
    const model = payloadString(entry.line.payload, "model");
    if (model !== undefined) {
      return model;
    }
  }
  return null;
}
