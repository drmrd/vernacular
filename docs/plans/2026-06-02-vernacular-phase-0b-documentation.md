# Vernacular: Phase 0b Documentation Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the project's standard documentation surface (changelog scaffold, contributor conduct, security disclosure policy, architecture pointer, roadmap, and contributor guide) on top of the Phase 0a foundation. No code changes; pure documentation.

**Architecture:** All files live at the repo root or under `docs/` already established in Phase 0a. The contributor-conduct document is downloaded canonical text (not paraphrased) with project-specific contact info patched in. The other files are short and project-specific, composed directly.

**Tech Stack:** Markdown files only. No new dependencies. Existing lint/format chain (Prettier on `.md`) covers them.

**Scope boundary:** This plan does NOT add Husky, commit-message linting, the release-please configuration, the CLAUDE.md file, the `.claude/` directory, or the `docs/knowledge/` directory. Those land in Phases 0c (Claude infrastructure) and 0d (lint and hook expansion). The CONTRIBUTING.md created here will reference future workflows lightly without depending on the tools yet.

---

## File Structure

| File                 | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `CHANGELOG.md`       | Keep-a-Changelog scaffold; release-please will manage from Phase 0e onward  |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1, downloaded canonical text with contact patched in |
| `SECURITY.md`        | How to report a vulnerability; project-specific, brief                      |
| `ARCHITECTURE.md`    | One-page overview pointing to the design specification                      |
| `ROADMAP.md`         | Phase summary distilled from the design specification                       |
| `CONTRIBUTING.md`    | Contributor guide; dev setup, PR flow, commit conventions, doc map          |
| `README.md`          | Modified to link the new documents                                          |

All files are added; only `README.md` is modified.

---

## Tasks

### Task 1: Verify branch and clean tree

- [ ] **Step 1: Confirm working directory and branch**

Run:

```
pwd
git branch --show-current
git status --short
```

Expected:

- `pwd` shows `/Users/dan/workspace/vernacular`
- `git branch --show-current` shows `feat/phase-0b-documentation`
- `git status --short` shows nothing (clean tree)

If any of these is wrong, STOP and report BLOCKED.

---

### Task 2: Create `CHANGELOG.md`

**Files:**

- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to Vernacular are tracked here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Vernacular will follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
beginning with version 1.0.0. Prior to 1.0.0, the API and data formats are
unstable and may change without backwards compatibility.

Starting in Phase 0e, this file is maintained automatically by
`release-please` from Conventional Commit messages. Until then, entries
are added by hand and intentionally coarse-grained (one bullet per phase).

## [Unreleased]

### Added

- Phase 0b: documentation surface (`CHANGELOG.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CONTRIBUTING.md`).
- Phase 0a: build foundation. TypeScript strict mode, Vite, React 18,
  Vitest with Testing Library, ESLint flat config, Prettier, Apache-2.0
  license and NOTICE, minimal README, first GitHub Actions CI workflow,
  initial App component built via a red-green-blue TDD cycle.
```

- [ ] **Step 2: Verify**

Run: `head -3 CHANGELOG.md`
Expected first line: `# Changelog`

---

### Task 3: Download canonical Contributor Covenant 2.1 and place at `CODE_OF_CONDUCT.md`

**Files:**

- Create: `CODE_OF_CONDUCT.md` (downloaded, then patched in Task 4)

- [ ] **Step 1: Download the canonical Markdown source**

Run:

```
curl -sSfL https://raw.githubusercontent.com/EthicalSource/contributor_covenant/master/content/version/2/1/code_of_conduct.md -o CODE_OF_CONDUCT.md
```

Expected: the file is created. (Do NOT open it or paste its contents into your reply.)

- [ ] **Step 2: Verify the file exists and is non-empty**

Run:

```
test -s CODE_OF_CONDUCT.md && wc -l CODE_OF_CONDUCT.md
```

Expected: a line count well above 100 lines. (The canonical document is roughly 140 lines.)

---

### Task 4: Patch `CODE_OF_CONDUCT.md` to insert project-specific contact information

The canonical document contains a placeholder for the contact method where conduct issues should be reported. Replace it with Vernacular's contact method (a confidential GitHub security advisory link, which doubles as the conduct intake for now since the project is pre-release).

- [ ] **Step 1: Patch the placeholder**

Run from the repo root:

```
python3 - <<'PY'
import pathlib
p = pathlib.Path('CODE_OF_CONDUCT.md')
text = p.read_text()
replacement = (
    'a private GitHub security advisory at '
    'https://github.com/drmrd/vernacular/security/advisories/new'
)
if '[INSERT CONTACT METHOD]' not in text:
    raise SystemExit(
        'expected placeholder [INSERT CONTACT METHOD] not found in CODE_OF_CONDUCT.md; '
        'the upstream canonical document may have changed format'
    )
p.write_text(text.replace('[INSERT CONTACT METHOD]', replacement))
print('patched')
PY
```

Expected output: `patched`.

If the script raises with the "placeholder not found" message, STOP and report BLOCKED. Do not attempt to guess the new placeholder name.

- [ ] **Step 2: Verify the placeholder is gone**

Run:

```
grep -c "\[INSERT CONTACT METHOD\]" CODE_OF_CONDUCT.md || echo 0
```

Expected output: `0`.

- [ ] **Step 3: Verify the contact replacement landed**

Run:

```
grep -c "drmrd/vernacular/security/advisories" CODE_OF_CONDUCT.md
```

Expected output: `1` or higher.

---

### Task 5: Create `SECURITY.md`

**Files:**

- Create: `SECURITY.md`

- [ ] **Step 1: Create `SECURITY.md`**

```markdown
# Security Policy

Vernacular is in pre-release development (Phase 0). The web app does not
yet collect, transmit, or persist any sensitive data, and there are no
publicly hosted instances we operate. Even so, we take any potential
security issue seriously and welcome reports.

## Reporting a vulnerability

Please report suspected vulnerabilities by opening a private GitHub
security advisory:
[github.com/drmrd/vernacular/security/advisories/new](https://github.com/drmrd/vernacular/security/advisories/new).

Use the advisory description to share what you observed, how to
reproduce it, and any thoughts on remediation. Avoid filing public
issues for the same content until we have responded.

## What to expect

While Vernacular is pre-1.0 and maintained by a small team, we do not
yet offer formal response-time guarantees. Our intent is:

- Acknowledge new advisories within a few business days.
- Confirm or dispute the report once we have reproduced it.
- Coordinate a fix and a disclosure timeline before any public
  discussion.

When Vernacular reaches 1.0 and gains a published deployment story,
this policy will be revised with concrete timelines.

## Supported versions

Until 1.0, only the `main` branch is supported. Older commits do not
receive backports.

## Scope

In scope: the code in this repository, the published asset packs, and
the build pipeline.

Out of scope: third-party hosting or instances run by others.
```

- [ ] **Step 2: Verify**

Run: `head -3 SECURITY.md`
Expected first line: `# Security Policy`

---

### Task 6: Create `ARCHITECTURE.md`

**Files:**

- Create: `ARCHITECTURE.md`

This file is intentionally short. It exists so a new contributor can find their way to the authoritative design specification quickly. The detailed content lives in the spec.

- [ ] **Step 1: Create `ARCHITECTURE.md`**

```markdown
# Architecture

The authoritative design specification for Vernacular is at
[`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md).
That document is the source of truth for every architectural decision.
Read it first.

This file is a tour pointer for contributors who want a quick map of
the codebase, not the spec itself.

## Six-layer structure

The codebase is divided into six layers. Each layer depends only on the
layers below it. Layer-crossing imports are enforced by ESLint
(boundary rules land in Phase 0d).
```

+------------------------------------------------------------+
| app/ Top-level routes, providers, app state |
+------------------------------------------------------------+
| editor/ React UI: shell, tools, panels, gizmos |
+------------------------------------------------------------+
| bridge/ R3F glue, the command-dispatch boundary |
+------------------------------------------------------------+
| engine/ Three.js scene management, renderers, loaders|
+------------------------------------------------------------+
| storage/ Project store, library store, asset cache |
+------------------------------------------------------------+
| core/ Pure-TS domain. No React. No Three.js. |
| Types, project model, registries, commands, |
| units, color, geometry, import/export |
| interfaces. |
+------------------------------------------------------------+

```

Hard invariants:

- `core/` has zero React, zero Three.js, zero DOM imports. Pure TS,
  testable in Node.
- `engine/` is the only layer that imports Three.js.
- `bridge/` is the only place that touches both React state and
  Three.js scene state. All mutations flow through `dispatch(command)`
  at this boundary.
- `storage/` exposes provider interfaces; multiple implementations
  exist (file system, OPFS, zip bundle, future cloud sync).

## Where to find things

| Topic                                  | Where to look                                              |
| -------------------------------------- | ---------------------------------------------------------- |
| Full design rationale                  | `docs/specs/2026-06-01-vernacular-design.md`               |
| Per-phase implementation plans         | `docs/plans/`                                              |
| Current roadmap                        | [`ROADMAP.md`](ROADMAP.md)                                 |
| Contributing                           | [`CONTRIBUTING.md`](CONTRIBUTING.md)                       |
| License and required attributions      | [`LICENSE`](LICENSE), [`NOTICE`](NOTICE)                   |
| Architecture decision records (future) | `docs/knowledge/decisions/` (added in Phase 0c)            |

## Status

Phase 0 is in progress. The current state of the codebase is the
build foundation only: a working TypeScript + React + Vite + Vitest
skeleton with a single-component smoke test. Most of the architecture
described above is still ahead of us; it will land incrementally
through Phases 0f and 0g, then Phase 1 onward.
```

- [ ] **Step 2: Verify**

Run: `head -3 ARCHITECTURE.md`
Expected first line: `# Architecture`

---

### Task 7: Create `ROADMAP.md`

**Files:**

- Create: `ROADMAP.md`

- [ ] **Step 1: Create `ROADMAP.md`**

```markdown
# Roadmap

Vernacular ships in phases. Each phase produces working, testable
software and has its own implementation plan in `docs/plans/`. The
authoritative phase list is in the design specification, section 10.
This file is a short status view.

## Current status

Phase 0 in progress (build foundation, documentation, engineering
norms, source skeleton, proof of life). Not yet usable as a floor
planner.

## MVP path (phases 0 through 6)

| Phase | Focus                                                   | Status      |
| ----- | ------------------------------------------------------- | ----------- |
| 0a    | Build foundation (TS, Vite, React, Vitest, ESLint, CI)  | done        |
| 0b    | Documentation surface (this set)                        | in progress |
| 0c    | CLAUDE.md, Claude agents, knowledge graph               | next        |
| 0d    | Lint rule expansion, Husky, commitlint, release-please  | pending     |
| 0e    | Testing scaffolds (Playwright, Storybook, Lighthouse)   | pending     |
| 0f    | Six-layer source skeleton                               | pending     |
| 0g    | Wall-drawing proof of life (first user flow)            | pending     |
| 0h    | Storage scaffolds (OPFS, IndexedDB, File System API)    | pending     |
| 0i    | Service worker, vernacular-pack CLI                     | pending     |
| 0j    | Phase 0 acceptance                                      | pending     |
| 1     | Two-dimensional plan editor                             | pending     |
| 2     | Three-dimensional preview with color-temperature slider | pending     |
| 3     | Furniture import and curated starter library (alpha)    | pending     |
| 4     | Old-house architectural vocabulary                      | pending     |
| 5     | Multi-floor and stairs (beta)                           | pending     |
| 6     | Paint, export, site metadata (1.0)                      | pending     |

## Beyond 1.0

| Phase | Focus                                               | Notes                |
| ----- | --------------------------------------------------- | -------------------- |
| 7     | DXF import; competitor migration via underlay path  | quick follow-on      |
| 8     | Lighting fidelity (solar position, baked GI, BRDFs) | high priority post-1 |
| 9     | Pathing critic with room-purpose-specific rules     | research-flavored    |
| 10    | Code-plugin runtime, image-to-3D, cloud sync        | longer-tail          |

## Contributing

The best places to help right now are the in-progress and next phases
above. Open an issue first to discuss any non-trivial change. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.
```

- [ ] **Step 2: Verify**

Run: `head -3 ROADMAP.md`
Expected first line: `# Roadmap`

---

### Task 8: Create `CONTRIBUTING.md`

**Files:**

- Create: `CONTRIBUTING.md`

This is the largest new file. It explains how to get the project running locally, the contribution flow, and the conventions contributors are expected to follow.

- [ ] **Step 1: Create `CONTRIBUTING.md`**

````markdown
# Contributing to Vernacular

Thanks for your interest in contributing. Vernacular is an open-source
floor planner aimed at power users, with a heavy lean toward homes that
mainstream floor planners do not represent well. We are in early Phase
0 development; the surface is small and the bar for help is correspondingly
low. Issues, design feedback, contributor packs (assets, registries),
and code contributions are all welcome.

## Before you start

- Read [`README.md`](README.md) for the quick orientation.
- Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the layer overview.
- The authoritative design lives at
  [`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md).
  Skim the table of contents at least.
- The current phase and what is coming next are in
  [`ROADMAP.md`](ROADMAP.md).
- All contributors are expected to follow the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- Security concerns go through the disclosure path in
  [`SECURITY.md`](SECURITY.md), not public issues.

## Development setup

Prerequisites:

- Node.js 20 or newer (see [`.nvmrc`](.nvmrc)).
- pnpm 9 or newer (see the `packageManager` field in
  [`package.json`](package.json)).

Clone the repository, install dependencies, and verify the local check
chain:

```sh
git clone git@github.com:drmrd/vernacular.git
cd vernacular
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```
````

Run the dev server with `pnpm dev`. The smoke test in
`src/App.test.tsx` is the only test in the repository today.

## How to file an issue

- Search [open issues](https://github.com/drmrd/vernacular/issues) first
  to avoid duplicates.
- Provide enough context to reproduce: operating system, browser,
  Node and pnpm versions, and what you ran. Screenshots help.
- For ideas and feature proposals, label your issue as a discussion
  and describe the problem before the proposed solution.

## How to propose a change

1. Fork the repository (or, if you have write access, create a feature
   branch directly).
2. Name the branch descriptively. The convention used so far is
   `feat/<scope>-<short-description>` or `fix/<scope>-<short-description>`
   for code changes, and `docs/<short-description>` for documentation.
3. Write your change. See "Conventions" below.
4. Open a pull request against `main`. Fill in the PR description with
   a clear summary and a test plan.
5. Wait for CI to go green and for review.

Small, focused PRs are easier to review and merge. If your work is
large, open an issue first to discuss scope and possibly split into
multiple PRs.

## Conventions

These will tighten in later phases as the tooling lands. Current state:

- **Commit messages** follow
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
  Common types we use: `feat`, `fix`, `refactor`, `docs`, `chore`,
  `test`, `style`. Mechanical enforcement via `commitlint` lands in
  Phase 0d.
- **Code style** is enforced by ESLint and Prettier. Run
  `pnpm lint` and `pnpm format:check` before pushing; `pnpm format`
  fixes most issues automatically. Stricter Clean Code rules
  (complexity caps, function length caps, layer-boundary rules) land
  in Phase 0d.
- **Tests** follow a behavior-first style: assert what the user
  experiences, not implementation details. The Vitest test in
  `src/App.test.tsx` is the current model. Red-green-blue TDD becomes
  a project-wide discipline in Phase 0c.
- **Documentation** changes that affect the architecture should also
  update an entry in `docs/knowledge/` once that directory exists
  (Phase 0c onward).

## Pull request checklist

Before requesting review, make sure:

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
      passes locally.
- [ ] The PR description explains what changes and why, and includes a
      test plan.
- [ ] New user-visible strings (when we have them) go through
      `i18n.t()` (this becomes relevant from Phase 0g onward).
- [ ] You have read and accept the project's license terms (Apache-2.0;
      see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)).

## Reviewing pull requests

Maintainers and other contributors are welcome to review. When you
review:

- Read the diff before reading the description so you form your own
  understanding.
- Be specific. Point at lines, propose alternatives, ask questions.
- Distinguish blocking comments from suggestions. Use the GitHub
  "Request changes" review type sparingly, and only for issues that
  must be addressed before merging.

## Asset and registry contributions

Asset packs (3D models, textures, color palettes) and registry packs
(element types, eras, trim profiles) ship through a separate workflow
that will be documented in Phase 0d alongside the publishing CLI. Until
then, propose contributions of this kind as issues with samples.

## License

Vernacular is licensed under Apache-2.0. By contributing to this
project, you agree that your contributions will be licensed under
the same terms. Asset packs may declare their own SPDX licenses;
see the project specification for details.

````

- [ ] **Step 2: Verify**

Run: `head -3 CONTRIBUTING.md`
Expected first line: `# Contributing to Vernacular`

---

### Task 9: Update `README.md` to link the new documents

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current `README.md`**

Run: `cat README.md`
Expected: the current content has the project title, a tagline, a status callout that links to the spec and `docs/plans/`, a `## Development` section, and a `## License` section.

- [ ] **Step 2: Replace the file with the updated content**

Write the following to `README.md` (overwrite the entire file):

```markdown
# Vernacular

Open-source floor planner for power users, with first-class support for
historic and period-vernacular architecture. Built for owners and enthusiasts
of houses that mainstream floor planners don't represent well: Victorian,
Edwardian, Craftsman, Mid-Century, and earlier.

> Status: early development (Phase 0). Not yet usable as a floor planner.
> See [`docs/specs/2026-06-01-vernacular-design.md`](docs/specs/2026-06-01-vernacular-design.md)
> for the design specification and [`docs/plans/`](docs/plans/) for in-progress
> implementation plans. The current phase and what's next are in
> [`ROADMAP.md`](ROADMAP.md).

## Documentation map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): one-page overview of the six-layer
  codebase and where to find things.
- [`ROADMAP.md`](ROADMAP.md): phase-by-phase plan.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): contribution workflow, dev setup,
  conventions.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md): community standards.
- [`SECURITY.md`](SECURITY.md): how to report security issues.
- [`CHANGELOG.md`](CHANGELOG.md): notable changes per release.
- `docs/specs/`: authoritative design specifications.
- `docs/plans/`: per-phase implementation plans.

## Development

Prerequisites:

- Node.js 20+ (see `.nvmrc`)
- pnpm 9+

```sh
pnpm install
pnpm dev        # start dev server (http://localhost:5173)
pnpm test       # run unit tests
pnpm typecheck  # TypeScript type check
pnpm lint       # ESLint
pnpm build      # production build to dist/
````

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contribution flow.

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

```

- [ ] **Step 3: Verify**

Run: `head -3 README.md`
Expected first line: `# Vernacular`

Run: `grep -c "ARCHITECTURE.md\|ROADMAP.md\|CONTRIBUTING.md\|CODE_OF_CONDUCT.md\|SECURITY.md\|CHANGELOG.md" README.md`
Expected output: at least `6`.

---

### Task 10: Apply Prettier formatting to the new and modified files

The previous tasks created and modified Markdown files; Prettier's check stage in the next task will fail if any of them have non-canonical formatting. Apply the formatter now so that the check is clean.

- [ ] **Step 1: Run Prettier on the changes**

Run:
```

pnpm format

```

Expected: completes without error. Some files may be reformatted; that is acceptable.

- [ ] **Step 2: Verify the formatter is now happy**

Run:
```

pnpm format:check

```

Expected: `All matched files use Prettier code style!`

---

### Task 11: All-checks rehearsal

- [ ] **Step 1: Run the full check chain**

Run:
```

pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build

```

Expected: exits 0 at the end. No file in this plan changes any TypeScript or React code, so the test set is still the single `src/App.test.tsx` smoke test passing. If any step fails, STOP and report.

---

### Task 12: Commit the documentation surface

- [ ] **Step 1: Stage the new and modified files**

Run:
```

git add \
 CHANGELOG.md \
 CODE_OF_CONDUCT.md \
 SECURITY.md \
 ARCHITECTURE.md \
 ROADMAP.md \
 CONTRIBUTING.md \
 README.md

```

- [ ] **Step 2: Verify staged set**

Run: `git status --short`

Expected: every entry is `A` (new file) except `README.md` which is `M` (modified). No other files staged.

- [ ] **Step 3: Pre-commit verification**

Run:
```

pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build

```

Expected: exits 0.

- [ ] **Step 4: Create the commit**

Use the following heredoc, which omits any Co-Authored-By trailer because the project setting `includeCoAuthoredBy: false` is in effect:

```

git commit -m "$(cat <<'EOF'
docs: add documentation surface (Phase 0b)

Phase 0b of the Vernacular implementation. Adds the project's standard
documentation surface on top of the Phase 0a build foundation:

- CHANGELOG.md (Keep-a-Changelog scaffold; release-please takes over
  maintenance in Phase 0e)
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1, canonical text, with
  the contact placeholder patched to the project's private security
  advisory link)
- SECURITY.md (vulnerability disclosure intake and current expectations)
- ARCHITECTURE.md (one-page pointer plus the six-layer overview, with
  authoritative detail in docs/specs/)
- ROADMAP.md (status table summarized from spec section 10)
- CONTRIBUTING.md (dev setup, PR flow, current conventions, pointers
  to other docs)

README.md updated to link the new files. No code changes; no
dependencies added. Existing CI workflow continues to cover this
content via the Prettier check.

This is hand-off-ready for Phase 0c (CLAUDE.md, Claude agents,
knowledge graph) per the spec's Phase 0 deliverable list.
EOF
)"

```

- [ ] **Step 5: Verify the commit landed**

Run: `git log --oneline -3`
Expected: the new commit `docs: add documentation surface (Phase 0b)` is at the top.

Run: `git status`
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 6: Confirm no Co-Authored-By trailer was added**

Run: `git log -1 --format=%B | grep -c "^Co-Authored-By:"` (a zero count means no such trailer)

Expected output: `0`.

---

### Task 13: Push and open the pull request

- [ ] **Step 1: Push the branch to the remote**

Run: `git push -u origin feat/phase-0b-documentation`

Expected: a new remote branch is created and tracking is set up.

- [ ] **Step 2: Open the pull request**

Run:
```

gh pr create --base main --head feat/phase-0b-documentation --title "Phase 0b: Documentation surface" --body "$(cat <<'EOF'

## Summary

Phase 0b of the Vernacular implementation, per `docs/plans/2026-06-02-vernacular-phase-0b-documentation.md`. Adds the project's documentation surface on top of the Phase 0a foundation. No code changes.

Files added:

- CHANGELOG.md
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1, canonical text)
- SECURITY.md
- ARCHITECTURE.md
- ROADMAP.md
- CONTRIBUTING.md

Files modified:

- README.md (added a documentation map linking the new files)

## Test plan

- [ ] CI green on this PR
- [ ] Manually review CONTRIBUTING.md for accuracy against current state
- [ ] Manually review ROADMAP.md against the spec's Phase 0 deliverables
- [ ] Confirm CODE_OF_CONDUCT.md no longer contains the placeholder `[INSERT CONTACT METHOD]`
- [ ] Confirm README.md links the new documents

## Out of scope (handed off to subsequent Phase 0 sub-plans)

Phase 0c (CLAUDE.md, Claude agents, knowledge graph, Clean Code review agent), 0d (lint rule expansion, Husky, commitlint, release-please), 0e (testing scaffolds), 0f/0g (six-layer source skeleton, command dispatcher, Hello-wall proof of life), 0h (storage scaffolds), 0i (service worker, vernacular-pack CLI), 0j (Phase 0 acceptance).
EOF
)"

```

Expected: a URL of the form `https://github.com/drmrd/vernacular/pull/<N>` is returned.

- [ ] **Step 3: Verify PR is open and CI started**

Run: `gh pr view --json url,state,statusCheckRollup --jq '"\(.state) \(.url)  checks=\(.statusCheckRollup | length)"'`

Expected: state is `OPEN`, the URL is the one just created, and `checks` is `1` or higher.

---

## What Phase 0b explicitly does NOT include

These items remain in the spec's Phase 0 scope but are intentionally out of THIS plan. Each gets its own sub-plan:

- **Phase 0c (Claude Code infrastructure):** `CLAUDE.md` under 200 lines; `.claude/rules.md` with the project's hard invariants and the Clean Code section; all subagent definitions in `.claude/agents/` (test-author, implementer, refactorer, clean-code-reviewer, pr-reviewer, knowledge-curator, pack-validator, migration-author); custom slash commands in `.claude/commands/`; tool wrappers in `.claude/tools/` enforcing the agent access controls; the seed `docs/knowledge/` directory with the starter Architecture Decision Records and the `INDEX.md` / `index.json` build script.
- **Phase 0d (lint and hooks expansion):** the full Clean Code-aligned ESLint rule set (`max-lines-per-function`, `complexity`, `max-depth`, `naming-convention`, `no-magic-numbers`, etc.), `eslint-plugin-boundaries` for layer enforcement, custom `no-direct-three-imports-outside-engine` and `no-direct-storage-API-outside-storage` rules, `jscpd`; Husky pre-commit hooks; `commitlint` for Conventional Commits enforcement; `release-please` configuration; PR template; issue templates.
- **Phase 0e (testing scaffolds):** Storybook, Playwright with multi-browser config, axe-core integration, Lighthouse CI, visual regression baselines, performance benchmark harness, Stryker mutation-testing config, `tests/fixtures/` and `tests/factories/` skeletons.
- **Phase 0f and 0g:** six-layer source skeleton, command dispatcher, scene graph skeleton, Three.js + R3F + WebGPU renderer skeleton, initial registries, Wall entity, the Hello-wall wall-drawing tool with full red-green-blue cycles, IndexedDB autosave, App shell.
- **Phase 0h:** `FileSystemFolderProjectStore`, `OPFSProjectStore`, `ZipBundleProjectStore`, `UserLibraryStore`, `AssetCache` skeletons, multi-tab Web Locks coordination.
- **Phase 0i:** service worker for offline app shell; `vernacular-pack` CLI scaffold (build, validate, publish) with manifest schema and sha256 integrity.
- **Phase 0j:** the full Phase 0 acceptance, including the Hello-wall end-to-end PR demonstrating red-green-blue with at least one actionable Clean Code finding.

Subsequent plans should assume the foundation that Phase 0b establishes (`CONTRIBUTING.md` exists; `ROADMAP.md` exists; the documentation map in `README.md` is in place; `ARCHITECTURE.md` is the entry point for layer overviews).

---

## Self-review notes (planning author only)

Spec coverage of THIS plan vs. spec Phase 0:
- Spec Phase 0 deliverable: "All documentation files (README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, ARCHITECTURE, ROADMAP, CHANGELOG scaffold)" - covered by Tasks 2 through 9. README was created in Phase 0a; modified here in Task 9.
- License is Apache-2.0; LICENSE and NOTICE were created in Phase 0a; no further change needed in 0b.

Placeholder scan: the only intentional placeholder anywhere in this plan is the temporary `[INSERT CONTACT METHOD]` line in the downloaded Contributor Covenant, which Task 4 patches. After Task 4, no placeholders remain.

Type consistency: `vernacular-pack` is used consistently as the CLI name. `feat/phase-0b-documentation` is the branch name across Task 1, Task 13, and the PR base/head. The branch base is `main`.

Format consistency: every `head -N` verification step uses three lines of expected output where possible. Every `pnpm` command uses the exact script name from `package.json` (`typecheck`, `lint`, `format:check`, `test`, `build`).
```
