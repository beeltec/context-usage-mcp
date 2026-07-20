import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Claude Code derives a project's transcript folder name from its working directory by
 * replacing every non-alphanumeric character with `-`.
 */
export function projectFolderName(projectDir: string): string {
  return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * The `~/.claude` root, overridable via `CLAUDE_CONFIG_DIR`.
 */
export function claudeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLAUDE_CONFIG_DIR;
  if (override !== undefined && override.trim().length > 0) {
    return override;
  }
  return join(homedir(), ".claude");
}

/**
 * Resolve the current session's transcript: the most-recently-modified `*.jsonl` (by mtime)
 * in `<claudeRoot>/projects/<projectFolder>/`. Returns `null` when `CLAUDE_PROJECT_DIR` is
 * unset or the project folder holds no transcripts.
 *
 * A missing/unreadable project folder yields `null`. Unexpected IO errors on individual files
 * are skipped; the server boundary (task 004) converts any surfaced error into an unavailable
 * result.
 */
export function findFreshestTranscript(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const projectDir = env.CLAUDE_PROJECT_DIR;
  if (projectDir === undefined || projectDir.trim().length === 0) {
    return null;
  }

  const dir = join(claudeRoot(env), "projects", projectFolderName(projectDir));

  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null; // project folder missing or unreadable
  }

  let best: { readonly path: string; readonly mtimeMs: number } | null = null;
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) {
      continue;
    }
    const full = join(dir, name);
    try {
      const stat = statSync(full);
      if (!stat.isFile()) {
        continue;
      }
      if (best === null || stat.mtimeMs > best.mtimeMs) {
        best = { path: full, mtimeMs: stat.mtimeMs };
      }
    } catch {
      continue; // skip files that vanish or can't be stat'd
    }
  }

  return best?.path ?? null;
}
