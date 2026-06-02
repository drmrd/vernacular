# CLAUDE.md

This file is the operating manual for Claude Code working on Vernacular. Loaded automatically at every session start. Keep it under 200 lines.

## Mission

Vernacular is an open-source floor planner for power users, with first-class support for historic and period-vernacular architecture (Victorian, Edwardian, Craftsman, Mid-Century, and earlier). The audience is power users and old-house renovators that mainstream floor planners do not serve well.

## Repository layout

```
.
├── app/              top-level routes, providers, state
├── editor/           React UI: shell, tools, panels, gizmos
├── bridge/           R3F glue and the command-dispatch boundary
├── engine/           Three.js scene mgmt, renderers, loaders
├── storage/          ProjectStore, LibraryStore, AssetCache
├── core/             Pure-TS domain. No React. No Three.js.
├── docs/
│   ├── specs/        authoritative design specifications
│   ├── plans/        implementation plans
│   └── knowledge/    decision records (ADRs) and glossary
├── scripts/          repo-level scripts
└── .claude/
    ├── rules.md      hard invariants and Clean Code rubric
    ├── agents/       project subagent definitions
    └── commands/     project slash commands
```

The source-layer directories under the repo root are placeholders today. Only `docs/`, `scripts/`, `src/` (a single placeholder App component), and `.claude/` carry meaningful content right now. New work lands in the appropriate layer once that layer is scaffolded.

## Hard invariants

See `.claude/rules.md` for the authoritative list. The non-negotiable highlights:

1. `core/` does not import React or Three.js.
2. `engine/` is the only Three.js importer.
3. All mutations flow through `dispatch(command)`.
4. Asset references are content-addressed.
5. 15-day dependency cooldown (`.npmrc` `minimum-release-age=21600`).
6. No `Co-Authored-By` trailers in commit messages.
7. No em-dashes in newly composed text.
8. Conventional Commits.
9. Author identity: `Dan Moore <9156191+drmrd@users.noreply.github.com>`.

## Naming and language policies

These are absolute and apply to every artifact that persists in the repo (branch names, commit messages, file names, file content) and to every PR description and other external-facing text.

1. **No internal-only shorthand or cryptic identifiers.** Do not invent or reuse codes such as alphanumeric phase shortcuts or other internal-only labels in branch names, commit messages, file names, or persisted document text. Use descriptive names that read as English to a first-time reader. Stable cross-industry conventions like `ADR-NNNN` are fine because they are widely understood.
2. **No mentions of other floor-planner products or other companies' products by name.** Do not refer to named third-party planners, modeling tools, or commercial products as comparison targets or inspiration. Use neutral phrasing such as "mainstream floor planners," "commercial planning tools," or "existing tools" when contrast is needed. This avoids any suggestion that Vernacular is a clone, a copy, or otherwise legally entangled with a third party.
3. **Branch names are descriptive.** Use `feat/<short-description>` or `fix/<short-description>` or `docs/<short-description>`. Do not embed milestone identifiers.
4. **Commit messages describe what the change is.** Use Conventional Commits (`type: subject`). Do not append milestone tags such as " (Phase X)" or "[stage Y]" to the subject or body.
5. **Plan and spec filenames are descriptive.** `YYYY-MM-DD-<short-name>.md`. No internal identifiers.

## Workflow

For every non-trivial change, follow:

1. **Brainstorm** if the change is open-ended; produce a spec under `docs/specs/`.
2. **Plan** with the writing-plans skill; output goes to `docs/plans/`.
3. **Branch** with `feat/<short-name>` or `fix/<short-slug>`.
4. **RED:** `/test-first <behavior>` invokes the `test-author` subagent for a failing test.
5. **GREEN:** `/implement` invokes the `implementer` subagent for the minimal passing implementation.
6. **BLUE-review:** `/clean-code-review` invokes the `clean-code-reviewer` subagent.
7. **BLUE-refactor:** `/refactor` invokes the `refactorer` subagent. An empty marker commit lands if no actionable findings.
8. **Repeat** RED-GREEN-BLUE for each behavior in the feature.
9. **PR-level review:** `/review` invokes the `pr-reviewer` subagent before merge.
10. **Knowledge curation:** if the change is architectural, the `knowledge-curator` adds or updates entries under `docs/knowledge/`.

## Knowledge graph

The knowledge graph at `docs/knowledge/` is a Claude-side workspace, not a part of the committed repository. The whole tree is gitignored (ADRs, glossary, the generated `INDEX.md` and `index.json`). Treat it as a local cache that supplements the design specification: regenerate or extend it as useful for context, but do not rely on it being present in a fresh clone, and do not propose changes that require it to be committed. The authoritative architectural source is the design specification under `docs/specs/`.

Before proposing an architectural change, check whether a local ADR captures relevant prior reasoning. After landing a meaningful architectural change, write or refresh an ADR locally so future sessions can pick up the context. Use `pnpm knowledge:index` to regenerate the local indices when useful.

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

The pack-validator and migration-author agents land alongside the pack tooling.

## Common shell commands

- `pnpm install --frozen-lockfile`: install dependencies (honors the 15-day cooldown).
- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`: the full check chain.
- `pnpm knowledge:index`: regenerate the optional knowledge index (gitignored).
- `pnpm dev`: dev server.

## Things never to do

- Skip the BLUE phase of a TDD cycle.
- Add a `Co-Authored-By: Claude` trailer to any commit.
- Add an em-dash to newly composed prose.
- Push directly to `main`.
- Force-push `main` without an explicit user authorization for that specific operation.
- Install a dependency younger than 15 days; pin to an older version or wait.
- Modify the design specification in `docs/specs/` without a corresponding ADR explaining the change.
- Touch a test file from the `implementer` agent role; touch implementation source from the `test-author` agent role.
- Use cryptic internal identifiers (such as milestone codes) in branch names, commit messages, or persisted document text.
- Refer to other floor-planner products or other commercial tools by name.

## Pointers

- Design specification: `docs/specs/2026-06-01-vernacular-design.md`.
- Architecture overview: `ARCHITECTURE.md`.
- Roadmap: `ROADMAP.md`.
- Contributing: `CONTRIBUTING.md`.
- Rules and Clean Code: `.claude/rules.md`.
