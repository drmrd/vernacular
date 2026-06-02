# CLAUDE.md

This file is the operating manual for Claude Code working on Vernacular. Loaded automatically at every session start. Keep it under 200 lines.

## Mission

Vernacular is an open-source floor planner for power users, with first-class support for historic and period-vernacular architecture (Victorian, Edwardian, Craftsman, Mid-Century, and earlier). The audience is power users and old-house renovators that mainstream floor planners do not serve well.

## Repository layout

```
.
├── app/              top-level routes, providers, state (Phase 0f+)
├── editor/           React UI: shell, tools, panels, gizmos (Phase 0f+)
├── bridge/           R3F glue and the command-dispatch boundary (Phase 0f+)
├── engine/           Three.js scene mgmt, renderers, loaders (Phase 0f+)
├── storage/          ProjectStore, LibraryStore, AssetCache (Phase 0f+)
├── core/             Pure-TS domain. No React. No Three.js. (Phase 0f+)
├── docs/
│   ├── specs/        authoritative design specifications
│   ├── plans/        per-phase implementation plans
│   └── knowledge/    knowledge graph (ADRs, glossary, patterns)
├── scripts/          repo-level scripts (e.g., knowledge-index)
└── .claude/
    ├── rules.md      hard invariants and Clean Code rubric
    ├── agents/       project subagent definitions
    └── commands/     project slash commands
```

The source-layer directories under the repo root land in Phase 0f and beyond. Today only `docs/`, `scripts/`, `src/` (a single placeholder App component), and `.claude/` carry meaningful content.

## Hard invariants

See `.claude/rules.md` for the authoritative list. The non-negotiable highlights:

1. `core/` does not import React or Three.js.
2. `engine/` is the only Three.js importer.
3. All mutations flow through `dispatch(command)`.
4. Asset references are content-addressed.
5. 15-day dependency cooldown (`.npmrc` `minimum-release-age=21600`).
6. Knowledge graph stays current; CI fails if `INDEX.md` and `index.json` drift.
7. No `Co-Authored-By` trailers in commit messages.
8. No em-dashes in newly composed text.
9. Conventional Commits.
10. Author identity: `Dan Moore <9156191+drmrd@users.noreply.github.com>`.

## Workflow

For every non-trivial change, follow:

1. **Brainstorm** if the change is open-ended; produce a spec under `docs/specs/`.
2. **Plan** with the writing-plans skill; output goes to `docs/plans/`.
3. **Branch** with `feat/phase-<id>-<short-name>` or `fix/<short-slug>`.
4. **RED:** `/test-first <behavior>` invokes the `test-author` subagent for a failing test.
5. **GREEN:** `/implement` invokes the `implementer` subagent for the minimal passing implementation.
6. **BLUE-review:** `/clean-code-review` invokes the `clean-code-reviewer` subagent.
7. **BLUE-refactor:** `/refactor` invokes the `refactorer` subagent. An empty marker commit lands if no actionable findings.
8. **Repeat** RED-GREEN-BLUE for each behavior in the feature.
9. **PR-level review:** `/review` invokes the `pr-reviewer` subagent before merge.
10. **Knowledge curation:** if the change is architectural, the `knowledge-curator` adds or updates entries; `pnpm knowledge:index` keeps the index in sync.

## Knowledge graph reliance

Before exploring or proposing architectural changes, consult `docs/knowledge/INDEX.md`. The Architecture Decision Records (ADRs) at `docs/knowledge/decisions/` are the authoritative record of why the codebase is shaped the way it is. After landing meaningful changes, update or add entries; run `pnpm knowledge:index` so the human and machine indices stay current.

## Slash commands

- `/knowledge [query]`: search the knowledge graph index.
- `/adr <slug> "Title"`: scaffold a new Architecture Decision Record.
- `/test-first <behavior>`: dispatch the test-author for a failing test.
- `/implement`: dispatch the implementer for the minimal implementation.
- `/refactor`: dispatch the refactorer for the BLUE phase.
- `/clean-code-review`: dispatch the clean-code-reviewer.
- `/review`: dispatch the pr-reviewer for a full PR audit.

## Subagents

Defined in `.claude/agents/`. The full roster:

- `test-author`: writes failing tests; cannot read implementation source.
- `implementer`: writes minimal implementations; cannot read tests.
- `refactorer`: applies refactors while keeping tests green.
- `clean-code-reviewer`: audits diffs against `.claude/rules.md`.
- `pr-reviewer`: end-of-branch audit; verifies RGB cycle.
- `knowledge-curator`: proposes knowledge graph updates.

The pack-validator and migration-author agents are reserved for Phase 0i.

## Common shell commands

- `pnpm install --frozen-lockfile`: install dependencies (honors the 15-day cooldown).
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`: the full check chain.
- `pnpm knowledge:index`: regenerate `docs/knowledge/INDEX.md` and `index.json`.
- `pnpm dev`: dev server.

## Things never to do

- Skip the BLUE phase of a TDD cycle.
- Add a `Co-Authored-By: Claude` trailer to any commit.
- Add an em-dash to newly composed prose.
- Push directly to `main`.
- Force-push `main`. (Force-push to a feature branch you own is fine.)
- Install a dependency younger than 15 days; pin to an older version or wait.
- Modify the design specification in `docs/specs/` without a corresponding ADR explaining the change.
- Touch a test file from the `implementer` agent role; touch implementation source from the `test-author` agent role.

## Pointers

- Design specification: `docs/specs/2026-06-01-vernacular-design.md`.
- Architecture overview: `ARCHITECTURE.md`.
- Roadmap: `ROADMAP.md`.
- Contributing: `CONTRIBUTING.md`.
- Knowledge graph: `docs/knowledge/INDEX.md`.
- Rules and Clean Code: `.claude/rules.md`.
