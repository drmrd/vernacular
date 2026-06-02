---
slug: decisions/ADR-0014-hooks-release-tooling
title: 'ADR-0014: Husky, commitlint, lint-staged, release-please'
type: decision
tags: [tooling, hooks, conventional-commits, release-engineering]
related: [decisions/ADR-0009-test-pyramid-rgb-tdd, decisions/ADR-0012-eslint-guardrails]
sourceFiles:
  [
    .husky/pre-commit,
    .husky/commit-msg,
    .husky/pre-push,
    commitlint.config.js,
    package.json,
    release-please-config.json,
    .release-please-manifest.json,
    .github/workflows/release-please.yml,
  ]
status: current
updated: 2026-06-02
---

# ADR-0014: Husky, commitlint, lint-staged, release-please

## Status

Accepted. Implemented in Phase 0d.2.

## Context

The project commits to Conventional Commits and a Clean Code rule set, and aspires to a clean release history. Without local enforcement, contributors land mis-typed commit messages, forget to run the lint-staged subset, and skip the full check chain before pushing; CI catches these but only after a round trip. release-please mechanizes the changelog and version bumps from those commits.

## Decision

- **Husky** owns the hook installation. The `prepare` npm lifecycle hook calls Husky so that `pnpm install` puts the hooks in place automatically.
- **`pre-commit`** runs `lint-staged` (only changed files, fast) and auto-regenerates the knowledge index when an entry was touched. The hook stages the regenerated index so the contributor does not have to.
- **`commit-msg`** runs `commitlint` configured against `@commitlint/config-conventional` with the project's narrowed type list (`feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`, `build`, `ci`).
- **`pre-push`** runs the full check chain. Heavy checks (Playwright, Lighthouse, mutation tests) stay in CI; the pre-push guard catches the typecheck/lint/format/test/build pipeline.
- **`lint-staged`** is configured in `package.json` per glob: TS files get ESLint plus Prettier; other recognized formats get Prettier only.
- **`release-please`** runs on push to `main` as a GitHub Actions workflow. The release type is `node`; the version is stored in `.release-please-manifest.json` (separate from `package.json` so `version` can stay `0.0.0` until 1.0). The changelog sections map Conventional Commits to human-friendly headings.

## Consequences

- A new contributor's first `pnpm install` activates all three hooks automatically.
- Non-conforming commit messages are rejected locally, not at PR time.
- The knowledge graph stays in sync without contributor effort.
- Mechanical release management: a PR merge to `main` either updates the open release PR or, if a release PR exists, opens a tag and refreshes the changelog when merged.
- Hooks can be bypassed with `--no-verify` when necessary; CI is the final guard.

## References

- Design specification, section 8.2 (Changelog and release engineering), section 8.5 (Pre-commit hooks).
- ADR-0009 (test pyramid; the pre-push hook runs the unit test pyramid before push).
- ADR-0012 (the ESLint guardrails that the pre-commit hook applies via lint-staged).
