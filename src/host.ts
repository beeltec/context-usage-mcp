import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Reading } from "./types.js";

/**
 * The set of supported hosts. Kept as a closed union so dispatch can be exhaustively checked
 * with a `never` fallthrough.
 */
export type Host = "claude" | "codex";

/**
 * A host adapter knows how to read the current session's token usage for one host. Each adapter
 * owns its own discovery + parsing; the shared server wiring only sees `Reading`.
 *
 * `readCurrentUsage` must never throw — every failure mode is converted into a structured
 * `{ available: false, reason }` result (parity across hosts).
 */
export type HostAdapter = {
  readCurrentUsage(): Reading;
};

/**
 * Injectable filesystem probe so `detectHost` stays pure and unit-testable without touching disk.
 */
export type FsProbe = {
  exists(path: string): boolean;
};

const realFsProbe: FsProbe = {
  exists: (path) => existsSync(path),
};

/** Explicit override env var; when set to a valid host it wins over all auto-detection. */
const HOST_OVERRIDE_ENV = "CONTEXT_USAGE_HOST";

function isHost(value: string): value is Host {
  return value === "claude" || value === "codex";
}

/**
 * Decide which host we are running under.
 *
 * Precedence:
 *  1. Explicit override `CONTEXT_USAGE_HOST=claude|codex` (an invalid value is ignored).
 *  2. `CLAUDE_PROJECT_DIR` set → `claude` (Claude Code always passes it).
 *  3. `CODEX_HOME` set, or `~/.codex/sessions` exists → `codex`.
 *  4. Fallback → `claude`, preserving the original single-host behavior.
 *
 * Pure: filesystem access goes through the injected `FsProbe`.
 */
export function detectHost(
  env: NodeJS.ProcessEnv = process.env,
  fsProbe: FsProbe = realFsProbe,
): Host {
  const override = env[HOST_OVERRIDE_ENV];
  if (override !== undefined) {
    const trimmed = override.trim();
    if (isHost(trimmed)) {
      return trimmed;
    }
  }

  const claudeProjectDir = env.CLAUDE_PROJECT_DIR;
  if (claudeProjectDir !== undefined && claudeProjectDir.trim().length > 0) {
    return "claude";
  }

  const codexHome = env.CODEX_HOME;
  if (codexHome !== undefined && codexHome.trim().length > 0) {
    return "codex";
  }
  if (fsProbe.exists(join(homedir(), ".codex", "sessions"))) {
    return "codex";
  }

  return "claude";
}
