# Agent Guidelines

## Project Wiki

This project keeps durable, cross-session knowledge in a wiki at `docs/wiki/`,
written in the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
Start at [`docs/wiki/index.md`](docs/wiki/index.md) — it links every page.

### When to consult it

- **At the start of any non-trivial task.** Read `docs/wiki/index.md`, then the
  pages relevant to what you're about to change. `overview.md` holds the goal,
  architecture, and every locked decision; `log.md` is the chronological
  decision history.
- **Before making a design or architecture decision**, check whether it was
  already resolved. Many choices (transcript-reader vs sidecar, npm publishing,
  Codex host adapter, output shape) are already locked in `overview.md` — do not
  silently re-decide them.
- **When something in the code surprises you.** The wiki usually records the
  *why* behind non-obvious choices (e.g. why cached tokens are subtracted, why
  tool schemas use zod raw shapes).

### When to update it

Update the wiki when a change produces knowledge that outlives the current
task — not for routine code changes the repo and git history already capture.
Update after:

- Making or reversing a **design/architecture decision** → record it in
  `overview.md` and add a dated entry to `log.md`.
- Learning a **durable, non-obvious fact** about a host, dependency, or external
  system (Claude Code / Codex internals, the MCP SDK, npm publishing) → put it on
  the relevant page.
- Adding or renaming a **wiki page** → link it from `index.md`.

Do **not** wiki-fy: transient task state (that belongs in `docs/tasks/`),
anything derivable from the code, or per-conversation details.

### How to update it

- Invoke the **`wiki` skill** (`/wiki`) for any create/update/organize work so
  the Open Knowledge Format conventions are applied consistently.
- **Preserve existing knowledge** and edit the *smallest relevant set of pages*.
  Prefer updating an existing page over creating a new one.
- Keep OKF front matter intact (`type`, `title`, `description`, `timestamp`);
  match the style of neighbouring pages.
- Use root-relative links between pages (e.g. `/docs/wiki/overview.md`).
- Log entries are append-only: add a new `## YYYY-MM-DD — <summary>` section to
  `log.md` rather than rewriting past history; cross-link to the page that holds
  the detail.
