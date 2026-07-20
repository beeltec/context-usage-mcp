import { readFileSync } from "node:fs";
import type { HostAdapter } from "../host.js";
import type { Reading } from "../types.js";
import { errorMessage } from "../util.js";
import { parseReading } from "./parser.js";
import { findCurrentRollout } from "./session.js";

/**
 * Codex CLI host adapter: locate the current session's rollout (cwd-match + freshest), read it,
 * and parse it into a `Reading`. Every failure mode — discovery, IO, parsing — is converted into a
 * structured unavailable result; this never throws (parity with the Claude adapter boundary).
 */
export const codexAdapter: HostAdapter = {
  readCurrentUsage(): Reading {
    let path: string | null;
    try {
      path = findCurrentRollout();
    } catch (error) {
      return {
        available: false,
        reason: `failed to locate rollout: ${errorMessage(error)}`,
      };
    }

    if (path === null) {
      return {
        available: false,
        reason: "no rollout file found for the current project",
      };
    }

    let contents: string;
    try {
      contents = readFileSync(path, "utf8");
    } catch (error) {
      return {
        available: false,
        reason: `failed to read rollout: ${errorMessage(error)}`,
      };
    }

    return parseReading(contents);
  },
};
