import {
  closeSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The Codex root: `CODEX_HOME` if set, else `~/.codex`. Rollouts live under
 * `<root>/sessions/YYYY/MM/DD/rollout-*.jsonl` (partitioned by date, not by project).
 */
export function codexRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CODEX_HOME;
  if (override !== undefined && override.trim().length > 0) {
    return override;
  }
  return join(homedir(), ".codex");
}

/**
 * Normalize a directory for comparison: resolve symlinks and trailing-slash/`.`/`..` differences.
 * Falls back to `resolve` when the path no longer exists (e.g. a session's original cwd was
 * removed), so a stale candidate is compared on a best-effort basis rather than throwing.
 */
function normalizeDir(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

const NEWLINE = 0x0a;
const CHUNK_BYTES = 65_536;
/**
 * Soft cap on how far we read looking for the first newline (checked per chunk, so it may overshoot
 * by up to one chunk). A `session_meta` line can embed sizable instructions, so allow ~1 MiB before
 * giving up (defensive against an unterminated file).
 */
const MAX_FIRST_LINE_BYTES = 1_048_576;

/**
 * Read only the first line of a file (the `session_meta` record) without loading the whole file.
 * Returns `null` on any IO error or if no newline-terminated first line is found within the cap.
 * Byte-level newline detection avoids splitting a multibyte UTF-8 character across chunk reads.
 */
function readFirstLine(path: string): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(CHUNK_BYTES);
    const collected: Buffer[] = [];
    let total = 0;
    while (total < MAX_FIRST_LINE_BYTES) {
      const bytesRead = readSync(fd, buffer, 0, CHUNK_BYTES, total);
      if (bytesRead === 0) {
        break; // EOF with no newline
      }
      const newlineAt = buffer.indexOf(NEWLINE, 0);
      if (newlineAt !== -1 && newlineAt < bytesRead) {
        collected.push(Buffer.from(buffer.subarray(0, newlineAt)));
        return Buffer.concat(collected).toString("utf8");
      }
      collected.push(Buffer.from(buffer.subarray(0, bytesRead)));
      total += bytesRead;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore close failures
      }
    }
  }
}

/** Read a property from an unknown value, returning `undefined` unless it is an indexable object. */
function prop(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  // Safe: `value` is narrowed to a non-null object above, and string-indexing any object yields
  // `unknown` (never widened to `any`); the result is treated as `unknown` by all callers.
  return (value as Readonly<Record<string, unknown>>)[key];
}

/**
 * Extract the `session_meta` cwd from a rollout's first line. Returns `null` when the line is
 * missing, malformed, not a `session_meta`, or carries no string `cwd`.
 */
function rolloutCwd(path: string): string | null {
  const firstLine = readFirstLine(path);
  if (firstLine === null || firstLine.trim().length === 0) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(firstLine);
  } catch {
    return null;
  }
  if (prop(json, "type") !== "session_meta") {
    return null;
  }
  const cwd = prop(prop(json, "payload"), "cwd");
  return typeof cwd === "string" ? cwd : null;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Local-date day-folder path for a given date: `<root>/sessions/YYYY/MM/DD`. */
function dayFolder(root: string, date: Date): string {
  const year = date.getFullYear().toString();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return join(root, "sessions", year, month, day);
}

type Candidate = { readonly path: string; readonly mtimeMs: number };

/**
 * Scan the given day-folders for `rollout-*.jsonl` files whose `session_meta.cwd` matches the
 * project dir, and return the freshest (by mtime). Missing folders and unreadable/vanishing files
 * are skipped, never fatal.
 */
function freshestMatch(
  root: string,
  dates: readonly Date[],
  normalizedProjectDir: string,
): string | null {
  let best: Candidate | null = null;
  for (const date of dates) {
    const dir = dayFolder(root, date);
    let entries: readonly string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // day folder absent or unreadable
    }
    for (const name of entries) {
      if (!name.startsWith("rollout-") || !name.endsWith(".jsonl")) {
        continue;
      }
      const full = join(dir, name);
      let mtimeMs: number;
      try {
        const stat = statSync(full);
        if (!stat.isFile()) {
          continue;
        }
        mtimeMs = stat.mtimeMs;
      } catch {
        continue; // file vanished or unreadable
      }
      const cwd = rolloutCwd(full);
      if (cwd === null || normalizeDir(cwd) !== normalizedProjectDir) {
        continue;
      }
      if (best === null || mtimeMs > best.mtimeMs) {
        best = { path: full, mtimeMs };
      }
    }
  }
  return best?.path ?? null;
}

/** Dates for the last `count` days (offset 0 = today), in most-recent-first order. */
function recentDays(now: Date, count: number): Date[] {
  const dayMs = 86_400_000;
  const dates: Date[] = [];
  for (let offset = 0; offset < count; offset++) {
    dates.push(new Date(now.getTime() - offset * dayMs));
  }
  return dates;
}

const NARROW_DAYS = 2; // today + yesterday
const WIDE_DAYS = 7;

/**
 * Locate the current Codex session's rollout: the freshest `rollout-*.jsonl` whose
 * `session_meta.cwd` matches `projectDir`, over a bounded day-folder scan.
 *
 * Scans **today + yesterday** first; only if nothing matches there does it **widen** to ~7 days
 * (the extra window tolerates the local/UTC date-boundary ambiguity of the day partitioning).
 * Returns `null` when nothing matches. Never throws on filesystem edge cases (missing dirs,
 * unreadable/vanishing files) — those candidates are skipped.
 *
 * Known accepted risk: two active sessions in the same project pick the freshest by mtime, which
 * is racy — the same heuristic (and limitation) as the Claude freshest-transcript selection.
 */
export function findCurrentRollout(
  env: NodeJS.ProcessEnv = process.env,
  projectDir: string = process.cwd(),
  now: Date = new Date(),
): string | null {
  const root = codexRoot(env);
  const normalizedProjectDir = normalizeDir(projectDir);

  const narrow = freshestMatch(
    root,
    recentDays(now, NARROW_DAYS),
    normalizedProjectDir,
  );
  if (narrow !== null) {
    return narrow;
  }
  return freshestMatch(root, recentDays(now, WIDE_DAYS), normalizedProjectDir);
}
