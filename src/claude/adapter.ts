import { readFileSync } from "node:fs";
import type { HostAdapter } from "../host.js";
import type { Reading } from "../types.js";
import { parseReading } from "../parser.js";
import { findFreshestTranscript } from "../session.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Claude Code host adapter: resolve the freshest transcript, read it, and parse it into a
 * `Reading`. Every failure mode — file selection, IO, parsing — is converted into a structured
 * unavailable result; this never throws, so the tool cannot crash the agent's flow.
 *
 * This preserves the original single-host behavior exactly; it is only relocated behind the
 * `HostAdapter` seam.
 */
export const claudeAdapter: HostAdapter = {
  readCurrentUsage(): Reading {
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
  },
};
