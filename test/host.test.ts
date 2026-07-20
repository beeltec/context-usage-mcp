import assert from "node:assert/strict";
import { test } from "node:test";
import { detectHost, type FsProbe } from "../src/host.js";

const noCodexDir: FsProbe = { exists: () => false };
const hasCodexDir: FsProbe = { exists: () => true };

test("override wins over all auto-detection signals", () => {
  const env = { CONTEXT_USAGE_HOST: "codex", CLAUDE_PROJECT_DIR: "/x" };
  assert.equal(detectHost(env, noCodexDir), "codex");
});

test("invalid override is ignored, falls through to signals", () => {
  const env = { CONTEXT_USAGE_HOST: "bogus", CLAUDE_PROJECT_DIR: "/x" };
  assert.equal(detectHost(env, noCodexDir), "claude");
});

test("CLAUDE_PROJECT_DIR signals claude", () => {
  assert.equal(detectHost({ CLAUDE_PROJECT_DIR: "/x" }, noCodexDir), "claude");
});

test("CODEX_HOME signals codex", () => {
  assert.equal(detectHost({ CODEX_HOME: "/c" }, noCodexDir), "codex");
});

test("~/.codex/sessions existing signals codex", () => {
  assert.equal(detectHost({}, hasCodexDir), "codex");
});

test("no signals falls back to claude", () => {
  assert.equal(detectHost({}, noCodexDir), "claude");
});
