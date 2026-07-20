---
type: Reference
title: npm publishing & provenance
description: How this package is published to npm with provenance from GitHub Actions.
tags: [npm, ci, provenance, distribution]
timestamp: 2026-07-20T00:00:00Z
---

# npm publishing & provenance

Reference for shipping **`@beeltec/context-usage-mcp`** to the public npm registry from CI.
Researched 2026-07-20 (npm Docs + GitHub Changelog).

## Scoped package publish

- A scoped package (`@beeltec/…`) publishes **private by default**. To publish publicly, either pass
  `--access public` or set `publishConfig.access = "public"` in `package.json`. We use
  `publishConfig` so both local and CI publishes behave the same.

## Provenance

- Provenance produces a signed attestation linking the published tarball to the exact repo + CI run;
  npm shows a "provenance" badge. Enable with `npm publish --provenance` (or env
  `NPM_CONFIG_PROVENANCE=true`).
- Requires the publish to run **from CI with `id-token: write`** permission, and the repo to be
  **public** (provenance is not supported from private repos).
- `package.json` **`repository.url` must match the GitHub repository** or provenance fails.

## Two ways to authenticate the publish

### A. Automation token (classic)
- Create an npm **automation** access token; store as the `NPM_TOKEN` repo secret.
- `actions/setup-node` with `registry-url` wires `NODE_AUTH_TOKEN` for `npm publish`.
- Works on the npm bundled with Node 20. Simple; the token is a long-lived secret to manage.

### B. Trusted Publishing / OIDC (GA July 2025, recommended)
- **No token secret.** A trust relationship is configured once on npmjs.com (org/user, repo,
  workflow filename, optional GitHub Environment). CI authenticates via OIDC.
- Provenance is emitted **by default** — `--provenance` becomes optional.
- Requires **npm CLI ≥ 11.5.1**, which is newer than the npm bundled with Node 20, so the workflow
  must `npm install -g npm@latest` (or run on a newer setup) before publishing.
- Still needs `id-token: write`. First-ever publish of a brand-new package name may still need a
  one-time manual/token publish depending on npm's current bootstrap rules — check npm docs.

## Sources

- <https://docs.npmjs.com/generating-provenance-statements/>
- <https://docs.npmjs.com/trusted-publishers/>
- <https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/>
