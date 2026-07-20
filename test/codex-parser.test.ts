import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReading } from "../src/codex/parser.js";

function fixture(name: string): string {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}

test("normal: last_token_usage mapped with cached subtracted from input", () => {
  const reading = parseReading(fixture("codex-normal.jsonl"));
  assert.equal(reading.available, true);
  if (!reading.available) return;

  // input 5300 includes cached 5000 -> non-cached 300; context = 300 + 200 + 5000.
  assert.deepEqual(reading.breakdown, {
    input_tokens: 300,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 5000,
    output_tokens: 150,
  });
  assert.equal(reading.context_tokens, 5500);
  assert.equal(reading.session_id, "sess-codex-1");
  assert.equal(reading.model, "gpt-5-codex");
  assert.equal(reading.timestamp, "2026-07-20T09:00:05.000Z");
});

test("older rollout without cache_write_input_tokens defaults it to 0", () => {
  const reading = parseReading(fixture("codex-no-cache-write.jsonl"));
  assert.equal(reading.available, true);
  if (!reading.available) return;

  assert.deepEqual(reading.breakdown, {
    input_tokens: 200,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 1000,
    output_tokens: 80,
  });
  assert.equal(reading.context_tokens, 1200);
});

test("multi-event: uses the last event's last_token_usage, not cumulative", () => {
  const reading = parseReading(fixture("codex-multi-event.jsonl"));
  assert.equal(reading.available, true);
  if (!reading.available) return;

  // Last event's last_token_usage: input 8000, cached 7000, cache_write 300.
  assert.equal(reading.context_tokens, 1000 + 300 + 7000);
  assert.equal(reading.breakdown.cache_read_input_tokens, 7000);
  assert.equal(reading.timestamp, "2026-07-20T14:00:12.000Z");
});

test("no token_count event yet is unavailable", () => {
  const reading = parseReading(fixture("codex-no-token-count.jsonl"));
  assert.equal(reading.available, false);
  if (reading.available) return;
  assert.match(reading.reason, /no token_count/);
});

test("token_count with null info is unavailable", () => {
  const line =
    '{"timestamp":"2026-07-20T15:00:00.000Z","type":"event_msg","payload":{"type":"token_count","info":null}}';
  const reading = parseReading(line);
  assert.equal(reading.available, false);
  if (reading.available) return;
  assert.match(reading.reason, /info is null/);
});

test("empty file is unavailable", () => {
  const reading = parseReading("\n  \n");
  assert.equal(reading.available, false);
  if (reading.available) return;
  assert.match(reading.reason, /empty/);
});
