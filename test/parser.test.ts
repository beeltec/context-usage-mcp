import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReading } from "../src/parser.js";

function fixture(name: string): string {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}

test("normal: last assistant usage yields correct total, breakdown, and metadata", () => {
  const reading = parseReading(fixture("normal.jsonl"));
  assert.equal(reading.available, true);
  if (!reading.available) return;

  assert.equal(reading.context_tokens, 120 + 300 + 5000);
  assert.deepEqual(reading.breakdown, {
    input_tokens: 120,
    cache_creation_input_tokens: 300,
    cache_read_input_tokens: 5000,
    output_tokens: 42,
  });
  assert.equal(reading.session_id, "sess-normal");
  assert.equal(reading.model, "claude-opus-4-8");
  assert.equal(reading.timestamp, "2026-07-20T10:00:01.000Z");
});

test("post-compaction: scans back past trailing non-assistant and malformed lines", () => {
  const reading = parseReading(fixture("post-compaction.jsonl"));
  assert.equal(reading.available, true);
  if (!reading.available) return;

  // Picks the last assistant message with usage (11:05), not the earlier one.
  assert.equal(reading.context_tokens, 200 + 0 + 8000);
  assert.equal(reading.timestamp, "2026-07-20T11:05:00.000Z");
});

test("no-usage: no assistant message with a usage block is unavailable", () => {
  const reading = parseReading(fixture("no-usage.jsonl"));
  assert.equal(reading.available, false);
  if (reading.available) return;
  assert.match(reading.reason, /usage/);
});

test("empty file is unavailable", () => {
  const reading = parseReading("\n  \n");
  assert.equal(reading.available, false);
  if (reading.available) return;
  assert.match(reading.reason, /empty/);
});
