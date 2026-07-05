---
name: vernacular-docs-and-writing
description: Use when writing or editing Vernacular repo documents or outward-facing text (ADRs, specs, plans, README, CHANGELOG, release notes, PR descriptions); when scaffolding an ADR, picking an ADR number, marking supersession, or pnpm knowledge:index fails on frontmatter; when unsure about em-dashes, internal shorthand, third-party product mentions, commit-message types, the humanizer pass, license or SemVer claims, or whether a committed doc is stale.
---

# Vernacular docs and writing

## Overview

Every document in this repo has exactly one home and one authority level, and every sentence that persists must read as plain, honest English. This skill covers where each document type lives, the ADR lifecycle and its indexer, the naming and language rules with their rationale, and what a claim must survive before it ships in outward-facing text.

## When to use

- Writing or revising anything under `docs/`, the README, CONTRIBUTING, or an ADR.
- Scaffolding an ADR, assigning ADR numbers, or superseding an ADR.
- `pnpm knowledge:index` fails, or `/knowledge` returns nothing.
- Composing a PR description, release-facing commit subject, or any external text.
- Deciding whether a committed doc is stale and safe to cite.

## When NOT to use

- Deciding whether a change needs an ADR at all, or how doc changes are gated and reviewed: see vernacular-change-control.
- Framing research claims, novelty, or state-of-the-art positioning: see vernacular-research-frontier.
- What counts as test evidence behind a claim: see vernacular-validation-and-qa.
- Pre-assigning ADR numbers across parallel worktree lanes (the mechanics): see vernacular-parallel-delivery; the numbering rules themselves are below.

## Quick reference

| Task                           | Command or path                                                      |
| ------------------------------ | -------------------------------------------------------------------- |
| Scaffold an ADR                | `/adr <short-slug> "Title for the ADR"`                              |
| Regenerate the knowledge index | `pnpm knowledge:index`                                               |
| Search the knowledge graph     | `/knowledge <query>` (needs a local index first)                     |
| Indexer source and schema      | `scripts/knowledge-index.mjs`                                        |
| Survey ADR statuses            | `grep -h 'status:' docs/knowledge/decisions/*.md \| sort \| uniq -c` |
| Em-dash scan before commit     | `LC_ALL=C grep -rn $'\342\200\224' docs/ README.md`                  |
| Pack license policy            | `core/assets/license-policy.ts`                                      |
| SemVer promise scope           | first ten lines of `CHANGELOG.md`                                    |
| Humanize prose                 | run the `humanizer` skill on the file before committing              |

## Doc taxonomy

| Location                                               | Role                                                                                                                                                                                                       | Committed?      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `docs/specs/`                                          | Authoritative design. `docs/specs/2026-06-01-vernacular-design.md` is the master; feature specs sit beside it. Editing any spec requires a corresponding ADR (see vernacular-change-control for the gate). | Yes             |
| `docs/plans/`                                          | Dated implementation plans, produced with the writing-plans skill per the CLAUDE.md workflow. Historical record; not authority.                                                                            | Yes             |
| `docs/knowledge/decisions/`                            | Architecture Decision Records (ADRs): durable design history, authoritative alongside the specs.                                                                                                           | Yes             |
| `docs/knowledge/INDEX.md`, `docs/knowledge/index.json` | Generated index over the knowledge tree. Regenerable cache, never source of truth.                                                                                                                         | No (gitignored) |
| `docs/delivery-strategy.md`                            | Durable delivery narrative. Live status lives in GitHub milestones and issues, never in a committed roadmap file. Do not recreate a roadmap doc.                                                           | Yes             |
| `ARCHITECTURE.md`, `README.md`, `CONTRIBUTING.md`      | Outward-facing orientation. ARCHITECTURE.md is currently the accurate one; README and CONTRIBUTING carry stale claims (table below).                                                                       | Yes             |

The `.gitignore` mechanism behind the cache split: `docs/knowledge/*` is ignored, then `!docs/knowledge/decisions/` negates the ADRs back in (lines 33 to 34). On this dev machine `docs/knowledge/` holds only `decisions/` plus the two generated index files.

Untracked local directories (`issue-notes/`, `docs/brainstorm-prep/`, `docs/design-review/`, as of 2026-07-05) are scratch, not committed truth. Never cite them from a committed document.

## ADR lifecycle

### Scaffold

```
/adr <short-slug> "Title for the ADR"
```

The command (`.claude/commands/adr.md`) creates `docs/knowledge/decisions/ADR-NNNN-<short-slug>.md` with frontmatter and Nygard-style headings: Status, Context, Decision, Consequences, References. Two scaffold traps:

1. **Number = max existing + 1.** Two parallel lanes that both scaffold get the same number. Collisions have happened; duplicates ADR-0076 (floor-slab-under-walls and wordmark-typeface) and ADR-0081 (canvas-design-tokens and opening-fill) are both on disk as of 2026-07-05. Pre-assign explicit numbers when dispatching parallel lanes and re-verify against `main` before landing.
2. **Frontmatter says `status: current` while the body Status section says "Proposed."** Reconcile both when you fill the ADR in.

### Frontmatter schema (enforced by the indexer)

All eight keys required; `scripts/knowledge-index.mjs` exits non-zero on the first violation.

| Key           | Constraint                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `slug`        | Must equal the path relative to `docs/knowledge/` minus `.md`, e.g. `decisions/ADR-0151-ambient-occlusion-render-pipeline` |
| `title`       | String, conventionally `'ADR-NNNN: Sentence title'`                                                                        |
| `type`        | One of `decision`, `pattern`, `anti-pattern`, `component`, `runbook`, `incident`, `glossary` (ADRs use `decision`)         |
| `tags`        | List; may not be omitted                                                                                                   |
| `related`     | List of slugs; `[]` allowed but the key must exist                                                                         |
| `sourceFiles` | List of repo-relative paths; `[]` allowed                                                                                  |
| `status`      | One of `proposed`, `current`, `superseded`, `deprecated`. NOTHING ELSE.                                                    |
| `updated`     | ISO date `YYYY-MM-DD`                                                                                                      |

**The status trap (issue #440).** The indexer rejects `accepted` and `rejected`. Five ADRs once carried `status: accepted` and killed every `pnpm knowledge:index` run; they were normalized to the indexer vocabulary on 2026-07-03 (commit `07690206`) and PR #466 (merged 2026-07-04) taught the indexer `proposed`. Issue #440 is still open as of 2026-07-05. Write `current` for a landed decision, `proposed` for one not yet in force. Never write `accepted`.

Prettier may wrap long inline arrays across lines; the indexer collapses that form, so both single-line `[a, b]` and the wrapped form parse.

Disk state as of 2026-07-05: 146 ADR files, 144 `current`, 1 `proposed` (ADR-0130), 1 `superseded` (ADR-0055). The indexer passes clean on all 146.

### Numbering state and rules

As of 2026-07-05: highest number 0152; numbers 0002, 0008 to 0011, and 0013 to 0015 have no file on disk, yet `.claude/rules.md`, `.npmrc`, `ARCHITECTURE.md`, and the knowledge-curator agent definition cite several of them (ADR-0002, 0009, 0010, 0011, 0013). Treat those citations as dead links: do not invent files to fill the gaps, and do not reuse the missing numbers, because committed text already refers to them as if they carried specific content.

Do not renumber a duplicate casually. Each duplicated ADR is cross-referenced by slug from roughly a dozen plans, specs, and other ADRs; renumbering means updating the filename, the `slug` field, and every `related:` and prose reference. That is an owner-sign-off docs change. Until then, cite a duplicated number by its full filename slug, never by bare number.

The indexer does NOT detect number collisions; it only checks that each file's slug matches its own path. Uniqueness discipline is on you.

### Supersession practice

Model pair: ADR-0055 and ADR-0060.

- Old ADR: set `status: superseded`; open the body Status section with "Superseded by ADR-NNNN." plus one line on what changed.
- New ADR: add the old slug to `related:`; open its Status section with "Supersedes ..." naming the old ADR.

Known inconsistency as of 2026-07-05: only ADR-0055 carries `status: superseded` even though other ADRs have been replaced in substance (example: ADR-0080 explicitly replaces ADR-0077's junction classification, yet ADR-0077 still says `current`). When you touch a superseded-in-fact ADR, flip its status and cross-link both directions. Do not mass-edit statuses without a reason to be in those files.

### After any ADR edit

```
pnpm knowledge:index
```

Regenerates `INDEX.md` and `index.json` locally and validates every entry. The `/knowledge` slash command reads `docs/knowledge/index.json` directly, so on a fresh clone `/knowledge` fails until you run the indexer once.

## Plan and spec conventions

- Filenames: `YYYY-MM-DD-<kebab-slug>.md`. Descriptive English slugs only; no milestone codes or internal shorthand.
- A feature's plan, spec, and ADR share the slug. Worked example: `docs/plans/2026-06-13-free-angle-endpoint-edits.md`, `docs/specs/2026-06-13-free-angle-endpoint-edits.md`, `docs/knowledge/decisions/ADR-0074-free-angle-endpoint-edits.md`.
- Specs keep unsettled items in an explicit section ("Open Questions ..." in the design spec, "Open questions and risks" in feature specs). That is where unproven ideas live until they earn a claim.
- Editing `docs/specs/` without a corresponding ADR is on the never-do list. Route through vernacular-change-control.

## House language rules (and why)

| Rule                                                                                                    | Rationale                                                                                                      | Enforcement                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No em-dashes in newly composed text                                                                     | The clearest mechanical tell of machine-written prose; rules.md rule 8                                         | pr-reviewer agent scans for them; scan yourself with the grep in Quick reference                                                                                        |
| No cryptic internal identifiers (phase codes, milestone tags) in branches, commits, filenames, doc text | A first-time reader must parse everything as English; rules.md rule 10. `ADR-NNNN` is fine (industry-standard) | Review; grep before landing                                                                                                                                             |
| Never name third-party floor-planner or commercial design products                                      | Avoids any clone or legal-entanglement implication; rules.md rule 11                                           | Use the README's model phrasing: "mainstream floor planners"                                                                                                            |
| Conventional Commits                                                                                    | Mechanical changelog generation via release-please                                                             | commitlint accepts exactly: `feat fix refactor docs chore test style perf build ci`; subject must not be Start Case, PascalCase, or UPPER CASE (`commitlint.config.js`) |
| Descriptive branch and file names                                                                       | Same readability principle                                                                                     | `feat/<short-description>`, `fix/...`, `docs/...`                                                                                                                       |

Note: rules.md rule 9 and CONTRIBUTING list only 7 commit types; commitlint is the enforcer and accepts 10. Trust `commitlint.config.js`.

## The humanizer expectation

Rules.md rule 17: run new or substantially revised prose through the `humanizer` skill before committing. It targets the machine-writing tells beyond em-dashes: significance inflation, promotional framing, vague attributions, formulaic "-ing" analyses, rule-of-three padding.

- In scope as written: specs, plans, ADRs, READMEs, top-level docs, any Markdown or plain-text prose.
- Exempt: code blocks, command output, data tables, downloaded canonical text (license texts, Contributor Covenant), and `CHANGELOG.md` release notes, where exact wording beats voice.
- Priority when time-limited: specs, ADRs, and READMEs are what humans actually read; never skip those. Plans are mostly agent-read.
- This is a real practiced step, not aspiration: see commit `87051f3c` ("docs: humanize finishes spec and ADR-0130 prose").

## External positioning discipline

### License facts

- Project license: Apache-2.0 (`LICENSE`, `NOTICE`, README License section). Rules.md cites ADR-0002 for this; that file does not exist, the LICENSE file is the authority.
- Pack license policy (`core/assets/license-policy.ts`, enforced by the pack CLI in `scripts/pack/vernacular-pack.mjs` and manifest validation):

| License class        | Members                                                                   | Behavior                                                                                            |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Recognized allowlist | CC0-1.0, CC-BY-4.0/3.0, CC-BY-SA-4.0/3.0, MIT, Apache-2.0, BSD-2/3-Clause | Ships                                                                                               |
| Share-alike          | CC-BY-SA-4.0, CC-BY-SA-3.0                                                | WARNS (non-blocking) when mixed with other licenses; redistribution must preserve share-alike terms |
| No-redistribution    | CC-BY-NC-_, CC-BY-ND-_, CC-BY-NC-ND-\*                                    | BLOCKS: "forbids redistribution and cannot ship in an open pack"                                    |
| Unrecognized SPDX id | anything else                                                             | BLOCKS: not on the curated allowlist                                                                |

### Version and stability claims

`CHANGELOG.md` header, verbatim policy: Vernacular follows Semantic Versioning **beginning with version 1.0.0**; before that, APIs and data formats are unstable and may change without backwards compatibility. Current version 0.3.1, released 2026-07-05 (`package.json`, `.release-please-manifest.json`).

Consequences for anything you write externally:

- Never promise API, file-format, or migration stability in a README, release note, or issue reply while the version is 0.x.
- Breaking changes are allowed pre-1.0 but must be recorded in release notes (precedent: the `.building` rename, transition note in `docs/specs/2026-06-10-vernacular-floor-plan-format.md` section 2.4).
- Release notes are generated by release-please from Conventional Commit subjects. The commit subject IS the future release-note line: write it as a truthful, user-comprehensible claim at commit time.

### Before a claim ships in a README or release note

All of these must hold, or the claim stays out (or stays labeled open or candidate):

1. The behavior is merged to `main` with the gates green (evidence bar: vernacular-validation-and-qa).
2. A test or committed baseline pins the behavior; "works on my machine" is not a claim.
3. No open issue contradicts the claim for the shipped configuration.
4. Unproven, partial, or planned work is phrased as such and lives in a spec open-questions section or an issue, not in marketing text.
5. Anything touching novelty or state-of-the-art framing goes through vernacular-research-frontier first.

## Stale committed docs (fix on touch, never propagate)

Verified stale as of 2026-07-05. When you edit one of these files, correct the stale claim in the same change rather than repeating it elsewhere.

| Doc                                                                      | Stale claim                                                                                                | Reality                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` (repo layout)                                                | "source-layer directories under the repo root are placeholders today"; only docs/scripts/src carry content | All six layers are live: core 303, editor 462, bridge 104, storage 91, engine 87, app 29 TS/TSX files |
| `README.md`                                                              | "Status: early development (Phase 0). Not yet usable as a floor planner."                                  | v0.3.1 shipped 2026-07-05; the 2D editor and 3D preview work                                          |
| `README.md`, `CONTRIBUTING.md`                                           | "Node.js 20+"                                                                                              | `engines` requires >=22.18.0; `.nvmrc` says 22                                                        |
| `CONTRIBUTING.md`                                                        | "The smoke test in src/App.test.tsx is the only test in the repository today."                             | Thousands of tests across unit, e2e, stories                                                          |
| `CONTRIBUTING.md`                                                        | "package.json version stays at 0.0.0 until the first 1.0"                                                  | `package.json` version is 0.3.1                                                                       |
| `CONTRIBUTING.md`, `.claude/rules.md` rule 9                             | 7 commit types                                                                                             | commitlint enforces 10 (adds `perf`, `build`, `ci`)                                                   |
| `.claude/rules.md` rule 6                                                | ADRs are a gitignored Claude-side cache, not committed                                                     | `decisions/` is committed durable history (`.gitignore` negation; CLAUDE.md agrees)                   |
| `.claude/rules.md`, `.npmrc`, `ARCHITECTURE.md`, knowledge-curator agent | Cite ADR-0002/0009/0010/0011/0013                                                                          | Those files are absent from `docs/knowledge/decisions/`                                               |

Fixing these is a `docs:` change through the normal PR flow; edits to `CLAUDE.md` or `.claude/rules.md` need owner sign-off (see vernacular-change-control).

## Common mistakes

- Writing `status: accepted` in ADR frontmatter. The indexer rejects it (issue #440); use `current` or `proposed`.
- Scaffolding ADRs in parallel lanes without pre-assigned numbers. The scaffold takes max+1; duplicates 0076 and 0081 exist because of exactly this.
- Renumbering a duplicated ADR without chasing every `related:` and prose reference; the indexer will not catch a collision for you either way.
- Running `/knowledge` on a fresh clone and concluding the knowledge graph is empty. Run `pnpm knowledge:index` first; the index is gitignored.
- Editing a spec without an ADR, or recreating a roadmap file. Both are on the never-do list.
- Copying stale claims forward (Phase 0 status, Node 20+, 7 commit types, "ADRs are uncommitted"). Check the stale-docs table first.
- Leaving the scaffold's `status: current` on an ADR whose body still says "Proposed."
- Promising stability, SemVer, or compatibility in external text while the project is 0.x.
- Naming a commercial floor planner in a comparison. Write "mainstream floor planners".
- Committing prose with an em-dash or skipping the humanizer pass on a spec, ADR, or README.

## Provenance and maintenance

All facts verified against the repo on 2026-07-05 (version 0.3.1, 146 ADRs, highest ADR-0152). Re-verify before relying on the volatile ones:

- Indexer status enum: `grep -n 'ALLOWED_STATUS' scripts/knowledge-index.mjs`
- Issue #440 still open: `gh issue view 440 --json state`
- Duplicate ADR numbers on disk: `ls docs/knowledge/decisions | grep -E 'ADR-00(76|81)'`
- Missing ADR numbers: `node -e "const f=require('fs').readdirSync('docs/knowledge/decisions').map(x=>parseInt(x.slice(4,8),10));const s=new Set(f);for(let i=1;i<=Math.max(...f);i++)if(!s.has(i))console.log(i)"`
- ADR status distribution: `grep -h 'status:' docs/knowledge/decisions/*.md | sort | uniq -c`
- Index regenerates clean: `pnpm knowledge:index`
- Commit types: `grep -A3 'type-enum' commitlint.config.js`
- SemVer-from-1.0 policy: `head -10 CHANGELOG.md`
- Current version: `node -p "require('./package.json').version"`
- Pack license lists: `sed -n '11,43p' core/assets/license-policy.ts`
- Knowledge cache gitignore split: `sed -n '28,35p' .gitignore`
- Stale-docs table rows: `grep -n 'placeholders' CLAUDE.md`, `grep -n 'Phase 0' README.md CONTRIBUTING.md`, `grep -n 'Node.js 20' README.md CONTRIBUTING.md`, `grep -n '0.0.0' CONTRIBUTING.md`, `grep -n 'gitignored' .claude/rules.md`
