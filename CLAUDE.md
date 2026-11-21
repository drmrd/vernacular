# CLAUDE.md

This file is the operating manual for Claude Code working on Vernacular. Loaded automatically at every session start. Keep it under 200 lines.

## Mission

Vernacular is an open-source floor planner for power users, with first-class support for historic and period-vernacular architecture (Victorian, Edwardian, Craftsman, Mid-Century, and earlier). The audience is power users and old-house renovators that mainstream floor planners do not serve well.

## Repository layout

Seven source layers are live, each with substantial production code and tests: `core/`, `storage/`, `session/`, `engine/`, `bridge/`, `editor/`, and `app/`. `src/` holds the Vite entry points (bootstrap, service worker, test setup). `ARCHITECTURE.md` says where things live and which layer may import which; specs, plans, and decision records sit under `docs/`.

## Hard invariants

See `.claude/rules.md` for the authoritative list. The non-negotiable highlights:

1. `core/` does not import React or Three.js.
2. `session/` imports no React and no Three.js and uses no DOM global.
3. `engine/` is the only Three.js importer.
4. All mutations flow through `dispatch(command)`.
5. Asset references are content-addressed.
6. 30-day dependency cooldown (`.npmrc` `minimum-release-age=43200`); exact version pins, no ranges (`save-exact=true`, committed lockfile).
7. No `Co-Authored-By` trailers in commit messages.
8. No em-dashes in newly composed text.
9. Conventional Commits.
10. Author identity: `Dan Moore <9156191+drmrd@users.noreply.github.com>`.

## Naming and language policies

These are absolute and apply to every artifact that persists in the repo (branch names, commit messages, file names, file content) and to every PR description and other external-facing text.

1. **No internal-only shorthand or cryptic identifiers.** Do not invent or reuse codes such as alphanumeric phase shortcuts or other internal-only labels in branch names, commit messages, file names, or persisted document text. Use descriptive names that read as English to a first-time reader. Stable cross-industry conventions like `ADR-NNNN` are fine because they are widely understood.
2. **No mentions of other floor-planner products or other companies' products by name.** Do not refer to named third-party planners, modeling tools, or commercial products as comparison targets or inspiration. Use neutral phrasing such as "mainstream floor planners," "commercial planning tools," or "existing tools" when contrast is needed. This avoids any suggestion that Vernacular is a clone, a copy, or otherwise legally entangled with a third party.
3. **Branch names are descriptive.** Use `feat/<short-description>` or `fix/<short-description>` or `docs/<short-description>`. Do not embed milestone identifiers.
4. **Commit messages describe what the change is.** Use Conventional Commits (`type: subject`). Do not append milestone tags such as " (Phase X)" or "[stage Y]" to the subject or body.
5. **Plan and spec filenames are descriptive.** `YYYY-MM-DD-<short-name>.md`. No internal identifiers.
6. **Prose reads as human-written.** New or substantially revised prose in Markdown and other text files passes through the `humanizer` skill before it lands, so specs, plans, ADRs, and READMEs avoid the common machine-writing tells. See `.claude/rules.md` rule 17. Code blocks, data tables, canonical downloaded text, and version-scoped release notes are exempt.

## Workflow

For every non-trivial change, follow:

1. **Brainstorm** if the change is open-ended; produce a spec under `docs/specs/`.
2. **Plan** with the writing-plans skill; output goes to `docs/plans/`.
3. **Branch** with `feat/<short-name>` or `fix/<short-slug>`.
4. **RED:** `/test-first <behavior>` invokes the `test-author` subagent for a failing test.
5. **GREEN:** `/implement` invokes the `implementer` subagent for the minimal passing implementation.
6. **BLUE-review:** `/clean-code-review` invokes the `clean-code-reviewer` subagent. While it runs, the main thread runs `pnpm green:proof --commit HEAD` in the background (sandbox off) and reads the summary before dispatching `/refactor`. The RED, GREEN, and refactor agents never run it. See ADR-0225.
7. **BLUE-refactor:** `/refactor` invokes the `refactorer` subagent. An empty marker commit lands if no actionable findings.
8. **Repeat** RED-GREEN-BLUE for each behavior in the feature.
9. **PR-level review:** `/review` invokes the `pr-reviewer` subagent before merge.
10. **Knowledge curation:** if the change is architectural, the `knowledge-curator` adds or updates entries under `docs/knowledge/`.

## Knowledge graph

The knowledge graph at `docs/knowledge/` is a Claude-side workspace. Architecture Decision Records under `docs/knowledge/decisions/` are committed to the repository as durable design history and are authoritative alongside the design specification under `docs/specs/`. The generated `INDEX.md` and `index.json` (and any glossary cache) stay gitignored and local: treat them as a regenerable cache, not a source of truth, and do not rely on them being present in a fresh clone.

Before proposing an architectural change, check whether an ADR captures relevant prior reasoning. After landing a meaningful architectural change, write or refresh an ADR (committed with the change) so future sessions and contributors can pick up the context. Use `pnpm knowledge:index` to regenerate the local indices when useful.

## Common shell commands

- `pnpm install --frozen-lockfile`: install dependencies (honors the 30-day cooldown).
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`: the full check chain.
- `pnpm knowledge:index`: regenerate the optional knowledge index (gitignored).
- `pnpm dev`: dev server.

## Things never to do

These add to the invariants and policies above.

- Skip the BLUE phase of a TDD cycle.
- Push directly to `main`.
- Force-push `main` without an explicit user authorization for that specific operation.
- Modify the design specification in `docs/specs/` without a corresponding ADR explaining the change.
- Touch a test file from the `implementer` agent role; touch implementation source from the `test-author` agent role.
- Recreate a committed roadmap file, or open a roadmap-status pull request. Delivery status is tracked GitHub-native (issues, the Projects v2 board, and milestones); only the durable strategy narrative is committed, in `docs/delivery-strategy.md`. Update issue and board status on GitHub rather than in the repository.

## Pointers

- Design specification: `docs/specs/2026-06-01-vernacular-design.md`.
- Architecture overview: `ARCHITECTURE.md`.
- Delivery roadmap (GitHub-native): the `public-alpha`, `public-beta`, and `1.0` milestones, and issues. Narrative and rationale: `docs/delivery-strategy.md`.
- Contributing: `CONTRIBUTING.md`.
- Rules and Clean Code: `.claude/rules.md`.
