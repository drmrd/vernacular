# The session layer and document identity: implementation plan

> **For agentic workers:** run every cycle from the main thread with the role-separated agents of
> this repository: `/test-first`, `/implement`, `/clean-code-review`, `/refactor`. A background
> agent cannot dispatch them. Tick the checkboxes as the work lands.

**Goal:** close #588, #591, #631, #672, and #673, and with them #685, so that the workspace holds
many projects with their own ids and addresses, every store reads and writes through one codec, a
project that breaks the format rules does not open as if nothing were wrong, and application logic
that needs no React has a layer of its own. It also closes two follow-ups on the save path: #734 in
pull request 2, and #741 in pull requests 2, 3, and 14.

**Architecture:** thirteen pull requests in seven lanes. The codec, the stores, and the session
layer land one after the other. Then the identity, assets, and settings lanes run in parallel. The
Projects page follows, then the failed-open pull request, and temporary storage closes the stage.
The refusal to open an invalid document goes live only in pull request 12, with the dialog. A
fourteenth pull request, for the newer stored file of #741, waits for a specification amendment and
lands after 13.

**Tech stack:** TypeScript, Vitest (the unit project on jsdom, and a new browser-mode project on
Chromium for IndexedDB and the origin private file system), Ajv standalone code generation, fflate,
ESLint flat config with `eslint-plugin-boundaries`, Playwright, Storybook.

**Spec:** `docs/specs/2026-11-15-session-layer-and-document-identity.md`. Records: ADR-0187 to
ADR-0191, and ADR-0175, ADR-0178, ADR-0180, ADR-0182, and ADR-0183 as amended. Read the spec
section named in each pull request before starting it. The "Done when" lists there are the
acceptance tests; this plan says where each one lives and what it is called.

**First stage:** this plan assumes `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md` has
landed as `docs/plans/2026-11-14-data-loss-fixes-and-guard-rails.md` describes it. Before each pull
request, check the names below against `main`. Where one differs, use the landed name and say so in
the description.

| First-stage result                                                                                       | There | Taken over by |
| -------------------------------------------------------------------------------------------------------- | ----- | ------------- |
| `KNOWN_KEYS` (`core/model/known-keys.json`); `graftWithTable` and `preserveUnknown`                      | 5.1   | 2             |
| `.house-backups/`, names with the version and a digest, written before migration                         | 5.2   | 3             |
| `ActiveProjectIdStore` and its classes, `isValidProjectId`, `newProjectId`, `vernacular.activeProjectId` | 5.3   | 6             |
| The failure view with "Start a new project", `app/app-failed-load.test.tsx`                              | 5.3   | 10, 13        |
| `registerAllProjectCommands`, `COMMAND_SAMPLES`, `extensionsFixture`                                     | 5.4   | 2             |
| `lintExceptions`, `buildConfig`, `tests/architecture/purity-rules.test.ts`, `import-graph.ts`            | 5.5   | 4             |
| `createReferenceProject` (`tests/performance/reference-project.ts`)                                      | 5.6   | 2, 6          |

## Global constraints

- Every document from schema version 8 onward still opens after every pull request, through every
  store. The format suites under `tests/format/` and, from pull request 3, the conformance suite
  check this.
- A user who has a project today finds it after the upgrade with no action: it keeps the id
  `'current'`, it opens at start, and it gets a card.
- No new runtime dependency and no routing library. A new development dependency must be older than
  the 30-day cooldown and pinned exactly. This plan needs none.
- `session/` imports no React and no Three.js and uses no DOM global. Browser storage APIs stay in
  `storage/`, and from pull request 9 lint holds that with no exception.
- Until pull request 12, a document that fails the strict check is reported and opens. No earlier
  pull request may refuse one. Every path that reads a document treats a `format-rules` failure the
  same way until then: it uses `failure.document`, warns with the faults, and goes on. The paths
  are the stores (cycles 2.5 and 3.2), the open step of the handle (5.3), `importFile` (5.6), the
  restore of a snapshot (2.5 and 5.8), and `reconcileIndex` (6.5). Cycle 12.3 flips each of them.
- No lint rule is switched off to reach zero problems. The first stage's exception list is the only
  place where a limit is raised or an import allowed for one file, and each entry names an open
  issue.
- Application code follows the red, green, blue cycle: `test:`, then `feat:` or `fix:`, then
  `refactor:`, an empty marker when the review finds nothing. The commit lines below name the first
  two; the `refactor:` commit always follows. Tooling cycles (lint, CI, scripts, generators) use
  `test:` then `build:` or `ci:`. A pure move under green tests is one `refactor:` commit.
- A GREEN commit changes no test file, and a deleted, moved, or split test file counts as changed.
  Tests that a cycle removes, moves, splits, or rewrites change in that cycle's RED commit. A
  `test:` commit that is not a cycle's RED (a benchmark, an end-to-end journey) lands after the
  cycle's `refactor:` commit, never between `feat:` and `refactor:`.
- No decision record is needed beyond ADR-0187 to ADR-0191. If a lane finds that it needs one, the
  orchestrator assigns the number. Two exceptions are known: cycle 2.4 adds a sentence to ADR-0184
  (#734), and pull request 14 needs a record of its own before it starts (#741).
- Each pull request passes `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
  `pnpm build`, and `pnpm rgb:audit --range origin/main..HEAD`, and from pull request 3
  `pnpm test:storage-browser`, each checked for its own exit code. `/clean-code-review` and
  `/review` run before it merges. It merges with a merge commit.
- New prose in a specification or a decision record passes through the `humanizer` skill and cites
  its record.

## Decisions this plan makes

The spec leaves these to the builder. They are fixed here so that two lanes cannot choose
differently.

1. **The codec is `decodeDocument` and `encodeDocument` in `core/format/codec/`**, beside the
   validators. Decode failures are a tagged union of five kinds, `not-json`, `not-a-project`,
   `newer-version`, `migration-failed`, and `format-rules`, one per cause of spec 5.2 point 8. A
   `format-rules` failure carries the migrated document, so the repair list and the interim open
   need no second decode.
2. **The revision is `meta.schemaRevision`**, and the build's is `CURRENT_SCHEMA_REVISION`. Adding
   the field is itself the first additive change to the current version, so this stage publishes
   revision 1 of the current version (17, unless cycle 1.3 raised it): a published schema is fixed
   once released (ADR-0178). The revision belongs to one version. Decode sets it back to 0 whenever
   it migrated to a higher version, and encode writes the higher of the document's revision and the
   build's only within one version.
3. **A later revision is published at `schema/<version>/revision-<R>/vernacular.schema.json`**, with
   the matching `$id` under `https://drmrd.github.io/vernacular/schema/`. Existing paths and `$id`
   values stay and count as revision 0.
4. **The validators are compiled when the schema is generated**, with Ajv's standalone code. The
   bundle then carries no schema compiler, a load pays no compile time, and no `new Function` runs,
   which keeps a strict content security policy possible. Two validators are generated: the strict
   one from the published schema, into `core/format/generated/current-schema-validator.js`, and the
   tolerant one from the same schema with every `additionalProperties: false` removed, into
   `core/format/generated/tolerant-schema-validator.js`. Dropping only the `additionalProperties`
   faults would not do: `SurfaceTreatment` and `UnderlaySource` are `anyOf` unions whose variants
   are closed, so an unknown field inside a variant also leaves `anyOf`, `const`, and `required`
   faults. The cost is two large generated files under drift control (`pnpm schema:check`), and
   the bundle delta goes in the description of pull request 2.
5. **Stores move bytes through a `ProjectFiles` port over `DirectoryPort`.** A workspace holds
   projects in id-named directories and the shared pool at `assets/`; a picked folder or an archive
   is one project at a root. This is the spec's directory port: the folder layout, the snapshot
   store, and `DirectoryAssetCache` serve every backend unchanged. `DirectoryPort` gains
   `modifiedAt(path)`, so every backend reports the time of the last change.
6. **IndexedDB becomes `IndexedDbDirectory`**, a `files` object store in the `vernacular` database
   at version 2. Version 1 records are converted on first use and kept until the converted file
   reads back equal (spec section 10).
7. **The codec wrapper is `DocumentStore`**; `WorkspaceDocumentStore` adds `delete`. A store over a
   picked folder has no delete method at all.
8. **The suite reaches IndexedDB through a Vitest browser-mode project, `storage-browser`**, on
   headless Chromium with the Playwright provider the Storybook project already uses, for files
   named `*.browser.test.ts`. It also runs the suite on the real origin private file system. No
   dependency is added, and the suite meets the real API rather than an imitation.
9. **`session/` layout:** `editor-session/`, `autosave/`, `handle/`, `flows/` (one file per flow),
   `projects/` (card model and index reconciliation), `settings/`, `ports.ts`, `index.ts`, and
   `testing/`. Tests and stories build a bare session through `session/testing`, which lint
   forbids to production files.
10. **The lock port is `ProjectLockPort`** (`tryAcquire`, `heldIds`, `supported`) over
    `navigator.locks.request` with `ifAvailable` and `navigator.locks.query`. The read-only outcome
    of ADR-0030 goes away. Two steps take the lock, both in `session/`: the open step of the handle,
    and the delete of a project, which holds it while it runs (spec 5.12 rule 1).
    `listProjectCards` is the only reader of `heldIds()`.
11. **The project index is its own IndexedDB database, `vernacular-index`**, with a `records` store
    keyed by id: readable before any project loads, usable beside both backends, and free of the
    project database's version changes. A preview can be tens of kilobytes, which rules out
    `localStorage`. The record is `ProjectRecord` in pull request 6; its asset list is content
    hashes plus a flag for a list that came from a best-effort read.
12. **A new id is a bare `crypto.randomUUID()`.** `newProjectId` keeps its signature; ids the first
    stage wrote as `project-<uuid>` stay valid under `isValidProjectId`.
13. **A project address is a URL fragment:** `#/project/<id>`, and `#/projects` for the page; the
    bare address means start. A fragment never reaches the server, so a static host needs no
    rewrite rule, and every request is the application root, which is what a shell cache serves
    offline. Existing query parameters keep working beside it. The cost is a less clean address. A
    new project's address replaces the history entry at its first save, so a reload before then
    never lands on an unknown-id page.
14. **The settings port reads synchronously over `localStorage`**, under
    `vernacular.settings.<name>` with JSON values, so the theme is known before the first paint. It
    falls back to memory when access is refused.
15. **Forbidden storage globals outside `storage/`:** `localStorage`, `sessionStorage`, `indexedDB`,
    `caches`, `showDirectoryPicker`, `showOpenFilePicker`, `showSaveFilePicker`, the same names as
    properties of `window`, `globalThis`, and `self`, and `navigator.storage` and `navigator.locks`.
    The rule covers `core/`, `session/`, `engine/`, `bridge/`, `editor/`, `app/`, and `src/`, with
    their tests and stories. `e2e/` is outside it, because a spec there evaluates browser code in
    the page (`e2e/tests/storage-capabilities.spec.ts` uses `navigator.storage` and `indexedDB`).
16. **The first stage's remembered id is read once** when pull request 6 builds the index from
    nothing: it becomes the latest use and the key is removed. The first-stage port goes away.
17. **The session layer's lint exceptions** use the rule `boundaries/dependencies` and a new field
    `allowImportOf: 'storage'`, because turning the rule off for a file would hide its other
    imports.
18. **The repair list is `DATA_REMOVING_REPAIRS` in `core/repairs/`.** The open flow applies every
    entry that recognizes the document, in order, and offers the result only when it passes, so a
    document with both known faults gets one offer and "still fails after every entry" has one
    meaning.
19. **An archive carries** every referenced asset whose bytes the pool has, except one an installed
    pack supplies. A `pack:` reference that no installed pack supplies and the pool lacks is a gap.
20. **The archive reader streams with fflate's `Unzip`**, so it stops when an entry passes a limit
    rather than after. Limits are a parameter, defaulting to the module values.
21. **The preview is made at each save and the record written each time.** If pull request 6
    measures a median preview time above 8 ms on the reference project, the record update runs
    after the save and coalesces to one per 2 seconds.
22. **Wording the spec leaves open:**

    | Text                            | Wording                                                                                                                 |
    | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
    | Empty Projects page             | "There are no saved projects yet."                                                                                      |
    | Last change                     | "Changed " and `Intl.DateTimeFormat` with `dateStyle: 'medium'`, `timeStyle: 'short'`                                   |
    | Floors                          | "1 floor", "&lt;n&gt; floors"                                                                                           |
    | No name from a best-effort read | "Unnamed project"                                                                                                       |
    | A repaired copy                 | "&lt;name&gt; (repaired copy)"                                                                                          |
    | An unchecked copy file          | `<slug>-unchecked-copy.building`                                                                                        |
    | The general repair              | "It removes 3 fields that the format does not define." ("1 field")                                                      |
    | Import with missing assets      | "The file did not include 2 of the assets this project uses. They show as missing."                                     |
    | Export with missing assets      | "The export does not include 1 asset, because this browser does not have it."                                           |
    | Saved with a fault              | "This project has a fault in its data. A copy of its last sound state is kept. You can export it."                      |
    | Saved by a newer build          | "A newer version of Vernacular saved this project. The data it added is kept."                                          |
    | Save failed during a switch     | "The changes could not be saved, so the project stays open."                                                            |
    | Unknown id                      | "This project is not stored in this browser."                                                                           |
    | Folder with no project          | "This folder holds no Vernacular project."                                                                              |
    | Temporary storage banner        | "This browser is not keeping your projects. They last until this tab closes. To keep one, export it, or open a folder." |
    | Save status, temporary storage  | "In this tab only"                                                                                                      |

    The banner's folder clause shows only where the browser offers folder access.

## Review focus

Inputs the spec implies that are most likely to hurt a user, most likely first. Each has a test in
the cycle named.

1. **Real projects meet the strict check at the first start after the upgrade.** A project from
   before #624 has a mixed paint entry, an older one carries a key a migration removed, and some
   carry both. One offer names both removals, and "Open as a new project" leaves the stored bytes
   identical. Cycle 12.2,
   `offers one repair for a document with both a mixed paint entry and an undefined field`.
2. **Every IndexedDB user's project is a version 1 record that holds an object.** The conversion
   writes the file, reads it back, and only then removes the record; a record whose file does not
   read back equal stays and the project opens from it. Cycle 3.5,
   `keeps a legacy record whose converted file does not read back equal`.
3. **The tab hides, closes, or switches while a write is in flight and another edit is pending.**
   The last state is stored, the close waits for it, and no two writes overlap. Cycle 5.2,
   `a close during an in-flight write stores the last edit`.
4. **The index is lost, stale, or refuses every call.** The page still lists every stored project
   and start still opens one. Cycle 6.5,
   `an index that rejects every call falls back to one rebuilt in memory`.
5. **An imported archive lies.** Declared sizes are small and inflated ones large, paths carry
   `../`, an asset's bytes match another hash, the document passes 64 MB. Cycle 8.1,
   `stops inflating an entry that passes the declared size`.

---

## Order and lanes

| #   | Pull request                          | Branch                                   | Issues                 | Lane              | Starts after    |
| --- | ------------------------------------- | ---------------------------------------- | ---------------------- | ----------------- | --------------- |
| 1   | A fixture for every schema version    | `feat/fixtures-for-every-schema-version` | #631                   | Codec             | the first stage |
| 2   | One document codec                    | `feat/one-document-codec`                | #631, #672, #734, #741 | Codec             | 1               |
| 3   | Byte stores and one conformance suite | `feat/byte-stores-and-conformance-suite` | #672, #741             | Stores            | 2               |
| 4   | The session layer                     | `feat/session-layer`                     | #685                   | Session layer     | 3               |
| 5   | The document handle and the flows     | `feat/document-handle-and-flows`         | #685, #588             | Session layer     | 4               |
| 6   | The project index and the preview     | `feat/project-index-and-preview`         | #588                   | Identity          | 5               |
| 7   | Addresses and start                   | `feat/project-addresses-and-start`       | #588                   | Identity          | 6               |
| 8   | Assets travel with documents          | `fix/assets-travel-with-documents`       | #673, #672             | Assets            | 5               |
| 9   | The settings port                     | `feat/settings-port`                     | #685                   | Settings          | 5               |
| 10  | The Projects page                     | `feat/projects-page`                     | #588                   | Projects page     | 7 and 8         |
| 11  | Card actions                          | `feat/project-card-actions`              | #588                   | Projects page     | 10              |
| 12  | A project that does not open          | `feat/failed-open-dialog-and-repairs`    | #631                   | Failed open       | 11              |
| 13  | Temporary storage says so             | `fix/temporary-storage-says-so`          | #591                   | Temporary storage | 12              |
| 14  | A save that finds a newer stored file | `fix/keep-a-newer-stored-file`           | #741                   | Newer stored file | 13              |

Pull requests 1 to 5 land in order. Pull request 1 comes first because a migration that produces a
document the current schema rejects needs a lossless step at the next `schemaVersion` before the
revision work builds on it. Pull request 5 brings the switch with the flows, because it removes the
discard prompt: from then on every path that replaces the open project writes its changes first.
After pull request 5, three lanes run in parallel in sibling worktrees: identity (6, then 7),
assets (8), and settings (9). The Projects page lane waits for 7 and 8, the needs that spec section
6 gives it. Pull requests 12 and 13 then land one after the other, because both edit the handle,
the Projects screen, and `app/app.tsx`. Pull request 14 starts only after a specification amendment
and its decision record are approved (see its section), and lands after 13, because it edits the
document store, the handle, and the Projects screen too.

File fences, in addition to spec section 6. A lane edits a file outside its fence only where the
table of shared files lists it.

- **Codec (1, 2):** `tests/fixtures/projects/versions/`, `core/migrations/schema/` (for a lossless
  step), `core/migrations/migrate.ts`, `core/migrations/migrate.test.ts`, and
  `core/migrations/index.ts` (for `isMigrationPending`, #734), `core/format/`, `core/model/factories.ts`, `core/commands/testing/`, `scripts/schema/`,
  `schema/`, `tests/format/`, `storage/folder/`, `storage/snapshots/`, `storage/import/`,
  `app/validate-loaded-project.ts`, `.prettierignore`, `tests/performance/encode-time.bench.ts`,
  `tests/architecture/codec-only-callers.test.ts`, one `ignores` line in `eslint.config.js`.
- **Stores (3):** `storage/fs/`, `storage/project-files/`, `storage/documents/`,
  `storage/indexeddb/`, `storage/opfs/`, `storage/filesystem/`, `storage/project-store.ts`,
  `storage/zip/zip-bundle-project-store.ts`, `storage/in-memory-project-store.ts`,
  `storage/project-storage.ts`, `tests/storage/`, `vitest.config.ts`, `.github/workflows/ci.yml`.
- **Session layer (4, 5):** spec section 6's list, plus `session/flows/switch-project.ts`,
  `app/resolve-snapshot-store.ts`, `app/use-resolved-snapshots.ts`, the discard files in `app/`,
  `editor/shell/discard-dialog.tsx`, every test and story in `bridge/` and `editor/` that builds a
  session or imports `storage/`, and `e2e/tests/discard-confirmation.spec.ts`.
- **Identity (6, 7):** `core/export/svg/`, `core/format/best-effort-read.ts`,
  `storage/project-index/`, `storage/active-project/`, `storage/recent/`,
  `storage/filesystem/directory-handle-store.ts`, `session/flows/start.ts`, `app/address.ts`,
  `app/resolve-place.ts`, `app/use-history-navigation.ts`.
- **Assets (8):** `storage/zip/`, `storage/import/`, `storage/assets/removable-assets.ts`,
  `session/flows/import-file.ts`, `session/flows/export-archive.ts`.
- **Settings (9):** `storage/settings/`, `storage/opfs/opfs-probe.ts`, `session/settings/`,
  `bridge/react/settings-context.tsx`, `editor/plan/snap-preferences.ts`,
  `editor/plan/snap-preferences-store.ts`, `editor/shell/shell-providers.tsx`,
  `editor/design-system/theme-provider.tsx`, `editor/design-system/theme.ts`,
  `editor/shell/theme-toggle.tsx`, `app/opfs-probe.ts`, `app/resolve-project-store.ts`,
  `tests/architecture/storage-globals.test.ts`.
- **Projects page (10, 11):** `editor/projects/`, `session/flows/rename-project.ts`,
  `session/flows/delete-project.ts`, `session/flows/export-project.ts`,
  `editor/shell/export-menu.tsx`, its new journeys.
- **Failed open (12):** `core/repairs/`, `editor/projects/failed-open-dialog.tsx`,
  `editor/projects/repair-choice-dialog.tsx`, `editor/projects/failure-sentences.ts`,
  `session/flows/open-failed.ts`, `storage/documents/open-despite-format-faults.ts`.
- **Temporary storage (13):** `app/use-degraded-storage-banner.ts`, `app/temporary-storage.test.tsx`.
- **Newer stored file (14):** `session/flows/choose-kept-file.ts` and the files its amendment
  names. It edits `storage/documents/`, `session/handle/`, and the Projects screen through the table
  below. If the choice of the user sits on the project card or in the failed-open dialog, it also
  edits `session/projects/` and `editor/projects/`, and the amendment must extend the table of
  shared files: pull request 14 joins the row for `session/projects/`, and `editor/projects/` gets
  a row of its own, in merge order after 12.

Files that more than one pull request edits have a fixed merge order. Where two of them run in
parallel, the one that merges second rebases. Every other file belongs to one fence above.

| File                                                                                                                                      | Edited by, in merge order                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `core/index.ts`                                                                                                                           | 2, 6, 12                                                     |
| `storage/index.ts`                                                                                                                        | 2, 3, 5, then 6, 8, and 9 as they merge, then 13             |
| `session/index.ts`                                                                                                                        | 4, 5, then 6, 7, 8, and 9 as they merge, then 10 to 14       |
| `package.json`                                                                                                                            | 3, then 6, 8, and 9 as they merge                            |
| `app/app.tsx`                                                                                                                             | 2, 4, 5, then 6, 7, and 9 as they merge, then 10, 11, 12, 13 |
| `eslint.config.js`                                                                                                                        | 2, 4, 5, 9                                                   |
| `src/main.tsx`                                                                                                                            | 5, 7                                                         |
| `src/e2e-storage-hook.ts`                                                                                                                 | 5, 6, 10, 12                                                 |
| `storage/import/`, `storage/zip/`                                                                                                         | 2 and 3, then 8                                              |
| `storage/folder/`, `storage/snapshots/`, `storage/documents/`                                                                             | 2, 3, 12, and 14 (`storage/documents/` only)                 |
| `storage/project-storage.ts`                                                                                                              | 3, 13                                                        |
| `session/ports.ts`                                                                                                                        | 5, 6                                                         |
| `session/handle/`                                                                                                                         | 5, 6, 12, 13, 14                                             |
| `session/autosave/`                                                                                                                       | 4, 5, 13                                                     |
| `session/projects/`                                                                                                                       | 6, 10, 11, 12                                                |
| `session/flows/import-file.ts`, `export-archive.ts`                                                                                       | 5, 8, 12                                                     |
| `app/create-session-ports.ts`                                                                                                             | 5, then 6, 8, and 9 as each needs, then 13                   |
| The four flow adapters in `app/` (`use-project-actions.ts`, `use-open-file-action.ts`, `use-export-actions.ts`, `use-workspace-state.ts`) | 2 (one line), 5, then 6, 7, and 8 as they merge              |
| `app/projects-screen.tsx` and its test                                                                                                    | 10, 11, 12, 13, 14                                           |
| `app/use-handle-notices.ts` and its test                                                                                                  | 5, 14                                                        |
| `tests/storage/conformance/`                                                                                                              | 3, 14                                                        |
| `app/app-failed-load.test.tsx`                                                                                                            | 10, 13                                                       |
| `editor/shell/project-menu.tsx`                                                                                                           | 6, 10, 11                                                    |
| `editor/shell/editor-shell.tsx`                                                                                                           | 4, 13                                                        |

Pull request 2 edits `app/app.tsx` and `app/use-open-file-action.ts` in one place each, to drop the
call to `validateLoadedProject`. Pull request 9 edits `app/app.tsx` in one place, to mount the
settings provider.

Documents that change with the code (spec section 8):

| Document                                                                         | Where         |
| -------------------------------------------------------------------------------- | ------------- |
| `ARCHITECTURE.md`, `CLAUDE.md`, `.claude/rules.md`, design spec section 2.1      | 4, texts      |
| Format spec section 7 and `schema/README.md` (the revision path)                 | cycle 2.1     |
| ADR-0184 (the previous file is current on every registry version, #734)          | cycle 2.4     |
| Format spec 7, design spec 5.5, first-stage spec 5.2 point 2 (the backup moment) | 3, texts      |
| Design spec section 5.3 (ids, addresses, the index)                              | 7, texts      |
| Design spec section 7.7 (the settings port)                                      | 9, texts      |
| Design spec section 5.6 (the second tab)                                         | cycle 10.5    |
| First-stage spec section 5.2 (the unchecked copy)                                | 11, texts     |
| Format spec sections 7 and 8, design spec 5.5 (the refusal and the repairs)      | cycle 12.7    |
| First-stage spec section 5.3 (the start-new control)                             | 13, texts     |
| The amendment for a newer stored file, its record, and ADR-0184 (#741)           | before 14     |
| The texts that amendment changes (see pull request 14)                           | before 14     |
| Skill notes under `.claude/skills/`                                              | after 5 and 7 |

---

## Pull request 1: a fixture for every schema version (#631)

Spec 5.2, the first "Done when" bullet, and the second risk of section 10. The files are
`tests/fixtures/projects/versions/v<N>.vernacular.json` for N from 8 to the current version. A
reader beside them, `index.ts`, exports `VERSION_FIXTURE_VERSIONS: readonly number[]` and
`versionFixtureBytes(version: number): Uint8Array`, read with Vite's `?raw` import so the browser
project of pull request 3 can use them too.

### Cycle 1.1: one fixture per version, valid against its own schema

- [ ] RED in `tests/format/version-fixtures.test.ts`: `VERSION_FIXTURE_VERSIONS` is every integer
      from 8 to `CURRENT_SCHEMA_VERSION`; each fixture's `meta.schemaVersion` is its version; each
      passes `createDocumentValidator` against `schema/<N>/vernacular.schema.json`; each carries at
      least one instance of every element kind its version defines, so every later migration step
      has input.
- [ ] GREEN: the files, hand-authored from each version's schema, and the reader.
- [ ] Commit: `test: add a stored fixture for every schema version`.

### Cycle 1.2: each fixture migrates to a document that passes the current schema

- [ ] RED in the same file: `migrateProject` on each fixture returns a document the current schema
      accepts; a failure lists the version and every error path.
- [ ] If a case fails, stop and report the versions and paths to the orchestrator. A fix that loses
      no data becomes cycle 1.3. A fix that would remove data goes to the repair list of pull
      request 12 instead, and the orchestrator decides whether the refusal can still go live.
- [ ] Commit: `test: expect every version fixture to migrate to a valid document`.

### Cycle 1.3: a lossless step for each case found (only if 1.2 found one)

- [ ] RED in `core/migrations/schema/<name>.test.ts`: the step turns the failing input into a
      document that passes, and every leaf value of the input is in the output.
- [ ] GREEN: the step at the next `schemaVersion`, registered in `SCHEMA_MIGRATIONS`;
      `pnpm schema:generate` publishes the version; a fixture for it joins the directory.
- [ ] Commits: `test: expect the <fault> to be repaired without loss`,
      `fix: repair the <fault> as a migration step`.

---

## Pull request 2: one document codec (#631, #672, #734, #741)

Spec 5.2. The strict check is built and every read and write goes through it, but the application
does not act on a failed check: the call sites open the migrated document and `console.warn` the
faults, as the load gate does today.

**Interfaces** (`core/format/codec/codec-types.ts`, exported from `core/index.ts`):

```ts
export interface FormatFault {
  /** JSON pointer; for an unknown field, the field's own path. */
  readonly path: string
  readonly rule: string
  readonly message: string
}
export type DecodeFailure =
  | { readonly kind: 'not-json'; readonly message: string }
  | { readonly kind: 'not-a-project' }
  | { readonly kind: 'newer-version'; readonly version: number; readonly buildVersion: number }
  | { readonly kind: 'migration-failed'; readonly fromVersion: number; readonly message: string }
  | {
      readonly kind: 'format-rules'
      readonly faults: readonly FormatFault[]
      readonly document: unknown // the migrated document
      readonly migratedFrom: number | undefined
    }
export interface DecodedDocument {
  readonly project: Project
  readonly migratedFrom: number | undefined
  readonly savedByNewerBuild: boolean
}
export type DecodeResult =
  | { readonly ok: true; readonly value: DecodedDocument }
  | { readonly ok: false; readonly failure: DecodeFailure }
/** Why encode wrote with no graft (#741): the previous bytes failed to decode this way. */
export type GraftDropped = Exclude<DecodeFailure, { readonly kind: 'format-rules' }>
/** `faults` is empty when the document passes; the bytes are returned either way. */
export interface EncodedDocument {
  readonly bytes: Uint8Array
  readonly faults: readonly FormatFault[]
  readonly graftDropped?: GraftDropped
}
export interface CodecOptions {
  /**
   * The one source of migration for the codec (#734). `migrateProject` and `isMigrationPending`
   * both read it, so a test that injects a step changes what is run and what counts as pending
   * together. Defaults to `{}`: the registered schema and registry steps, and the current schema
   * version as the target. The codec passes it on unchanged and holds no `targetVersion` of its own.
   */
  readonly migration?: MigrateOptions
}

export function decodeDocument(bytes: Uint8Array, options?: CodecOptions): DecodeResult
export function encodeDocument(
  project: Project,
  previous: Uint8Array | undefined,
  options?: CodecOptions,
): EncodedDocument
// core/format/current-schema.ts
export function checkCurrentSchema(document: unknown, mode: 'strict' | 'tolerant'): FormatFault[]
// core/migrations/migrate.ts, beside migrateProject and over the same two lists (#734)
export function isMigrationPending(raw: unknown, options?: MigrateOptions): boolean
```

`graftWithTable` and `preserveUnknown` move unchanged to `core/format/codec/graft.ts`. The JSON
helpers move to `core/format/codec/document-json.ts` as `parseDocumentJson` and
`serializeDocumentJson`, not exported from the barrel. `storage/folder/preserve-unknown.ts` and
`storage/folder/project-json.ts` are deleted.

### Cycle 2.1: the revision and its publication path

- [ ] RED in `tests/format/schema-drift.test.ts`: the committed schema at the path for
      `SCHEMA_VERSION` and `SCHEMA_REVISION` equals the regenerated one; a pure
      `driftVerdict(committed, regenerated, numbers)` in `scripts/schema/build-schema.mjs` fails
      when the schemas differ and neither number rose; `schemaPath(17, 0)` is
      `schema/17/vernacular.schema.json` and `schemaPath(17, 1)` is
      `schema/17/revision-1/vernacular.schema.json`; every existing `$id` is unchanged. These
      examples take 17 as the current version. If cycle 1.3 raised it, use the new number.
- [ ] GREEN: `schemaRevision?: number` in `ProjectMeta`, `CURRENT_SCHEMA_REVISION = 1` in
      `core/model/factories.ts`, the script, and `schema/17/revision-1/`. `schema/README.md` and
      format spec section 7 describe the path (ADR-0178).
- [ ] Commits: `test: expect the schema drift check to require a version or revision increase`,
      `feat: add the schema revision to the project meta`,
      `build: publish schema revisions beside their version`.

### Cycle 2.2: the validators are generated

- [ ] RED in `tests/format/current-schema-validator.test.ts`: `pnpm schema:check` exits non-zero
      and names `core/format/generated/current-schema-validator.js`, or
      `tolerant-schema-validator.js`, when that file is stale (run on a temporary copy); an unknown
      root key gives one fault at `/x-unknown` with rule `additionalProperties` in strict mode and
      none in tolerant mode; tolerant mode accepts an unknown field inside a paint entry; an unknown
      key in `extensions` gives none; a missing `meta.name` gives a fault in both modes.
- [ ] GREEN: the generator step for both validators (the tolerant one from the schema with every
      `additionalProperties: false` removed), `core/format/current-schema.ts` over them, and
      `core/format/generated/` in `.prettierignore` and in the `ignores` of `eslint.config.js`.
      Record the production bundle size before and after, for the description.
- [ ] Commits: `test: expect generated strict and tolerant validators for the current schema`,
      `build: generate the current schema validators with the schema`,
      `feat: check a document against the current schema`.

### Cycle 2.3: decode

- [ ] RED in `core/format/codec/decode-document.test.ts`:
  - bytes that are not JSON give `not-json`; `[]`, `null`, `"x"`, and `{}` give `not-a-project`;
  - `CURRENT_SCHEMA_VERSION + 1` gives `newer-version` with both numbers;
  - an injected schema step that throws (`migration: { schemaMigrations }`) gives
    `migration-failed` with the stored version;
  - every version fixture decodes, with `migratedFrom` set below the current version;
  - `x-unknown` on a wall at the current revision gives `format-rules` with the path
    `/floors/0/walls/0/x-unknown`;
  - the same with `schemaRevision: CURRENT_SCHEMA_REVISION + 1` decodes, keeps the key, and has
    `savedByNewerBuild: true`; so does an unknown field inside a paint entry at that revision;
  - an older-version fixture given `schemaRevision: 3` decodes with no revision carried and
    `savedByNewerBuild: false`, because the revision resets when the version rises;
  - a paint entry of one `kind` that carries a field only another variant defines gives
    `format-rules`; an unknown key inside `extensions` decodes.
- [ ] GREEN: `decodeDocument`.
- [ ] Commits: `test: expect decode to migrate, check strictly, and type each failure`,
      `feat: decode stored documents through one codec`.

### Cycle 2.4: encode, and its time

- [ ] RED in `core/format/codec/encode-document.test.ts`: encode writes `CURRENT_SCHEMA_REVISION`
      and keeps a higher revision; a document read at a higher revision encodes with no fault, and
      its unknown field survives a second decode; an unknown key in the previous bytes survives;
      previous bytes that are not JSON, are not a project, are at a newer version, or fail to
      migrate are ignored, and `graftDropped` carries that `DecodeFailure` as it is, with its own
      fields (`not-json` and `migration-failed` have a `message`, `not-a-project` has none,
      `newer-version` has both versions) (#741); an
      unknown field at the current revision gives non-empty `faults` and bytes that hold the
      document; the older-version fixture given `schemaRevision: 3` encodes with
      `CURRENT_SCHEMA_REVISION`; decode of encode is equal for every fixture.
- [ ] RED for #734, in the same file and in `core/migrations/migrate.test.ts`: the previous file is
      brought current before the graft whenever any migration is pending for it.
  - With an injected registry migration that drops a key named `legacy`
    (`migration: { registryMigrations }`, the only option the test passes), a stored file at the
    current schema version, one registry version behind and carrying `legacy`, goes through decode,
    encode, and decode again, and `legacy` is absent. There is no second option to forget: one
    object feeds both the migration and the pending check.
  - A previous file with no schema step and no registry step pending is not migrated (an injected
    step that counts its calls).
  - `isMigrationPending` is true below the target version, true at it when a registry in
    `meta.registryVersions` has a step from its stored version, and false otherwise.
- [ ] GREEN: `encodeDocument`, grafting at the root of `KNOWN_KEYS`. It runs `migrateProject` on the
      previous document when `isMigrationPending` says so, and only then, passing both the same
      `options.migration`. The first stage's skip,
      which looks at the schema version alone, is not carried over. `isMigrationPending` sits
      beside `migrateProject`. ADR-0184 gains the sentence that the previous file is current on
      its schema version and on every registry version before the graft (#734). No registry
      migration that removes or renames a key may land before this cycle merges.
- [ ] `tests/performance/encode-time.bench.ts` runs `encodeDocument` on `createReferenceProject()`
      with its own bytes as the previous file. Run it with `pnpm exec vitest bench --project unit`
      on `main` and on the branch on one machine; both medians go in the description.
- [ ] Commits: `test: expect encode to check, graft, and write the revision`,
      `feat: encode documents through one codec`; after this cycle's `refactor:` commit,
      `test: measure the encode time of the reference project`.

### Cycle 2.5: every path reads and writes through the codec

- [ ] RED: in `storage/folder/folder-project-store.test.ts`, a stored file that fails the check
      loads as the migrated document and `console.warn` receives the faults (interim; pull request
      12 reverses it); in `storage/snapshots/snapshot-store.test.ts`, a version 8 snapshot restores
      through decode, and one that fails the check restores its migrated document with a warning
      (interim); in `storage/import/import-project-file.test.ts`, a `.json` file at a higher
      version rejects with an error whose `failure.kind` is `newer-version`.
- [ ] GREEN: the folder store, the snapshot store, and the import call the codec; the first-stage
      backup rule stays until pull request 3. `app/app.tsx` and `app/use-open-file-action.ts` stop
      calling `validateLoadedProject`, and `app/validate-loaded-project.ts` is deleted.
- [ ] Commits: `test: expect every store and import to read through the codec`,
      `feat: read and write every document through the codec`.

### Cycle 2.6: every command leaves a document that passes the schema

- [ ] RED in `core/commands/commands-keep-schema.test.ts`: for each type in
      `registerAllProjectCommands(new CommandRegistry()).types()`, the command from
      `COMMAND_SAMPLES` on a copy of `schemaFixture()` leaves `checkCurrentSchema(result, 'strict')`
      empty. A second test runs a handler written for the test that plants a mixed paint entry, and
      the check names it, which shows the test would have caught #624. `schemaFixture()`, in
      `core/commands/testing/schema-fixture.ts`, is `extensionsFixture()` with every planted
      unknown key removed, so the sample ids still match.
- [ ] GREEN: any handler the test names. If more than five fail, report the list first.
- [ ] Commits: `test: expect every command to leave a document that passes the schema`,
      `fix: keep every command's result within the schema`.

### Cycle 2.7: no other caller

- [ ] RED in `tests/architecture/codec-only-callers.test.ts`, with `readLayerSources`: no
      production file outside `core/format/` and `core/migrations/` names `migrateProject`,
      `isMigrationPending`, `createDocumentValidator`, `createTolerantValidator`,
      `createStrictValidator`, `checkCurrentSchema`, `parseDocumentJson`, or
      `serializeDocumentJson`; a planted sample is named in the failure.
- [ ] GREEN: nothing if cycle 2.5 is complete; otherwise the remaining call site.
- [ ] Commit: `test: expect only the codec to migrate, parse, serialize, and validate`.

The description states the bundle delta and the encode times, and says "Closes #734".

---

## Pull request 3: byte stores and one conformance suite (#672, #741)

Spec 5.3, and point 4 of spec 5.6.

**Interfaces:**

```ts
// storage/project-files/project-files.ts
export interface ProjectFiles {
  readonly durable: boolean
  /** The ids that hold a document file. Never reads the file. */
  ids(): Promise<string[]>
  /** One project's directory: vernacular.json, .house-backups/, .house-autosave/. */
  projectDirectory(id: string): DirectoryPort
  assetsFor(id: string): AssetCache
}
export interface RemovableProjectFiles extends ProjectFiles {
  /** Removes every file of the project and leaves no empty directory. */
  remove(id: string): Promise<void>
}
// WorkspaceFiles(root, { durable }) implements RemovableProjectFiles.
// FolderFiles(id, folder, { durable, shared? }) implements ProjectFiles: one project at a root,
// with missing assets copied in from `shared` on save.

// storage/documents/document-store.ts
export type StoreRead =
  | { readonly ok: true; readonly value: DecodedDocument; readonly lastChangedAt?: string }
  | { readonly ok: false; readonly failure: StoreReadFailure } // not-found, or decode with its DecodeFailure
export interface SaveReport {
  readonly faults: readonly FormatFault[]
  readonly backedUp: boolean
  /**
   * Why this save wrote with no graft (#741); undefined when it grafted or had no previous file.
   * Nothing reads it before pull request 14, so until then the console warning is the only report.
   */
  readonly graftDropped?: GraftDropped
}
export interface ProjectSummary {
  readonly id: string
  readonly lastChangedAt: string | undefined
}
export class DocumentStore {
  constructor(files: ProjectFiles, options?: CodecOptions)
  readonly durable: boolean
  list(): Promise<ProjectSummary[]>
  read(id: string): Promise<StoreRead>
  /** Rejects only when the bytes could not be written. */
  save(id: string, project: Project): Promise<SaveReport>
  snapshots(id: string): ProjectSnapshots
  assets(id: string): AssetCache
  storedFiles(id: string): Promise<ReadonlyMap<string, Uint8Array>>
  /** Interim, removed by pull request 12: writes the migration backup, returns the document. */
  openDespiteFormatFaults(id: string, failure: DecodeFailure): Promise<Project>
  /** Interim, removed by pull request 5: read() with the interim policy, throwing on failure. */
  load(id: string): Promise<Project>
}
// WorkspaceDocumentStore extends DocumentStore over RemovableProjectFiles and adds delete(id).

// storage/documents/project-snapshots.ts: the codec in front of SnapshotStore
export interface ProjectSnapshots {
  writeSnapshot(project: Project): Promise<void>
  prune(): Promise<void>
  isRecoverable(): Promise<boolean>
  restore(): Promise<DecodeResult | undefined>
}

// storage/filesystem/folder-access.ts
export interface FolderAccess {
  readonly supported: boolean
  /** Shows the browser's folder picker; undefined when the user cancels. */
  pick(): Promise<FileSystemDirectoryHandle | undefined>
  /** The id of a known folder that is the same entry as `handle`. */
  findKnown(handle: FileSystemDirectoryHandle): Promise<string | undefined>
  remember(id: string, handle: FileSystemDirectoryHandle): Promise<void>
  forget(id: string): Promise<void>
  permission(id: string): Promise<'granted' | 'prompt' | 'denied' | 'missing'>
  /** After a user gesture: requests access and returns the folder's files. */
  reopen(id: string): Promise<FolderFiles | 'denied' | 'missing'>
}
```

`ProjectStore` becomes an alias of `DocumentStore`, so type imports compile. The five store classes
become thin constructors over these two and keep their names until pull request 5 removes the last
callers. `SnapshotStore` moves bytes only.

### Cycle 3.1: projects as bytes

- [ ] RED: in the shared `storage/fs/directory-contract.ts`, `modifiedAt(path)` is `undefined` for
      a missing path and, after a write, an ISO string no earlier than the clock before it; in
      `storage/project-files/workspace-files.test.ts`, `ids()` lists `a` and `b` for
      `a/vernacular.json` and `b/vernacular.json`, leaves out `assets` and a directory with no
      document, and reads no document (a directory that counts reads); after `remove('a')` the
      root has no `a` and no empty directory, and `b` is byte-identical; in `folder-files.test.ts`,
      `FolderFiles` has no `remove` (`@ts-expect-error`), lists its id only when it holds a
      document, copies a referenced asset the folder lacks from the shared pool on save, and reads
      an asset from the folder first.
- [ ] GREEN: `modifiedAt` on `InMemoryDirectory` (with `{ now?: () => Date }`),
      `FileSystemDirectory` (the file's `lastModified`), and `SubdirectoryPort`; the two classes.
- [ ] Commits: `test: expect projects to be listed and removed as bytes`,
      `feat: hold projects as bytes behind one port`.

### Cycle 3.2: the codec wrapper and the moment of the backup

- [ ] RED in `storage/documents/document-store.test.ts`, over `WorkspaceFiles` on an
      `InMemoryDirectory`:
  - a stored version 8 fixture reads with `migratedFrom: 8`, and one file under
    `a/.house-backups/` holds the original bytes;
  - a read of bytes that are not JSON, or through a migration that throws, writes nothing;
  - a save with an unknown field returns `faults` and `backedUp: true`, and a backup holds the
    bytes of the last stored file that passed; a second faulty save adds no backup;
  - `load()` of a migrated document that fails the check writes the migration backup first;
  - after `delete('a')`, a listing of the root shows nothing under `a`;
  - a dropped graft is reported (#741): a save over a previous file at a newer version, one that is
    not JSON, and one whose migration throws each still writes, returns `graftDropped` with that
    failure, and `console.warn` receives the reason. Until pull request 14, the save over a newer
    file still replaces it.
- [ ] GREEN: `DocumentStore` and `WorkspaceDocumentStore`. Backup names keep the first-stage rule,
      with the prefix `last-valid-` for a fault backup. `save` passes the `graftDropped` of encode
      to its report and warns with it. No caller reads `SaveReport.graftDropped` before pull request
      14, so the console warning is the only diagnostic until then.
- [ ] Commits: `test: expect the store to back up after a successful migrated decode`,
      `feat: put the codec in front of every store`.

### Cycle 3.3: the store kinds on the byte port

- [ ] RED: in the existing tests of the in-memory, origin private file system, and archive stores,
      `list()` returns `{ id, lastChangedAt }` with no name, and every other case passes unchanged.
      Two test files are new: `storage/filesystem/file-system-folder-project-store.test.ts`, where,
      with `notes.txt` and `drawings/` in the folder, no method removes a file it did not write and
      there is no `delete`; and `storage/indexeddb/indexeddb-project-store.browser.test.ts`, where
      `list()` has the same shape.
- [ ] GREEN: the five classes over the wrapper; `createOpfsProjectStorage` and
      `createDefaultProjectStorage` give a `DirectoryAssetCache` on every durable backend.
      `BrowserFolderAccess` in `storage/filesystem/folder-access.ts` replaces `FileSystemFolderProjectStore.open` and `reopen`, keeps
      `DirectoryHandleStore`, and finds a known folder with `isSameEntry`; `InMemoryFolderAccess`
      serves tests. The picker is checked by hand, as today.
- [ ] Commits: `test: expect every store kind to list ids and never empty a picked folder`,
      `feat: build every store kind from the byte port and the codec wrapper`.

### Cycle 3.4: IndexedDB as a directory, in a real browser

- [ ] RED in `storage/indexeddb/indexeddb-directory.browser.test.ts`: the directory contract passes
      on `IndexedDbDirectory` with a fresh database name per test. `pnpm test:storage-browser` runs
      it, and `pnpm test` does not pick up `*.browser.test.ts`.
- [ ] GREEN: `IndexedDbDirectory` (records `{ path, bytes, modifiedAt }`); the `storage-browser`
      project in `vitest.config.ts` and the unit project's exclusion; the `test:storage-browser`
      script; a CI job that installs Chromium as the Storybook job does, runs when the test
      selection is not `none`, and joins the `needs` of `ci-complete`.
- [ ] Commits: `test: expect IndexedDB to meet the directory contract in a real browser`,
      `ci: run the storage backends in a real browser`,
      `feat: store IndexedDB projects as files in a directory port`.

### Cycle 3.5: version 1 records are converted

- [ ] RED in `storage/indexeddb/legacy-records.browser.test.ts`, seeding a version 1 database with
      `{ id: 'current', project }`:
  - before any conversion, `IndexedDbDirectory` serves the record as `current/vernacular.json`, so
    `ids()` lists `current` and the project reads;
  - after the first open, `current/vernacular.json` is a file that decodes to the record's object,
    and the record is gone;
  - `keeps a legacy record whose converted file does not read back equal` (an injected
    `readBack`): the converted file is removed, the record stays, and the project still reads from
    the record;
  - a second open writes nothing.
- [ ] GREEN: `IndexedDbDirectory` serves a version 1 record with no converted file as
      `<id>/vernacular.json`. `convertLegacyRecords(db, options?)` in
      `storage/indexeddb/legacy-records.ts`, run once before the first read, writes the file, reads
      it back, and removes the record only when the two are equal; on a mismatch it removes the
      converted file and keeps the record. It writes `JSON.stringify` of the stored object, a byte
      copy and not an encode; the first read after it decodes, migrates, and backs up as for any
      file.
- [ ] Commits: `test: expect stored IndexedDB records to become files without loss`,
      `feat: convert stored IndexedDB records to files`.

### Cycle 3.6: one conformance suite

`describeStoreConformance(target)` in `tests/storage/conformance/describe-store-conformance.ts`. A
target has a `name`, an `open()` that gives a new instance over the same bytes, and `holdsMany`
for workspaces.

- [ ] RED, one case per point of spec 5.3 design point 3: every version fixture opens, and each
      migrated one leaves one backup; a higher-revision field and an `extensions` payload survive a
      save; a cleared optional field stays cleared; an asset is there from a new instance; (many)
      a save of one project leaves the other's bytes identical, and a delete removes one project
      and nothing else; `list()` includes a project whose bytes are not JSON; a document with an
      unknown field fails to read with `format-rules` and still saves; (one project) a save leaves
      every file it did not write byte-identical.
- [ ] Targets: in the unit project, a memory workspace, an OPFS workspace on `InMemoryDirectory`, a
      picked folder on `InMemoryDirectory`, and an archive; in
      `tests/storage/conformance/browser-stores.browser.test.ts`, the IndexedDB workspace and the
      real origin private file system.
- [ ] GREEN: whatever a target fails.
- [ ] Commits: `test: run one conformance suite against every store`,
      `fix: bring every store to the conformance suite`.

### Texts

- [ ] Format spec section 7, design spec section 5.5, and first-stage spec section 5.2 point 2: the
      migration backup is written after a decode that migrated and succeeded (ADR-0190). Commit:
      `docs: describe the backup written after a successful decode`.

---

## Pull request 4: the session layer (#685)

Spec 5.1, design points 1 to 3 and 6. Files move; behavior does not.

### Cycle 4.1: lint knows seven layers

- [ ] RED in `tests/architecture/layer-boundaries.test.ts`, one case each: from `session/`, imports
      of `../bridge`, `../editor`, and `../engine` are rejected and `../core` and `../storage`
      accepted; `bridge/` accepts `../session` and `../engine`; `editor/` accepts `../session` and
      `../bridge` and rejects `../engine`; `engine/` rejects `../storage`. In
      `tests/architecture/import-cycles.test.ts`, `readLayerSources` includes a `session/` file.
- [ ] GREEN: `session` joins `layerElements`, `boundaries/include`, `layerRules` (the table of
      ADR-0175), and the layer list of `tests/architecture/import-graph.ts`. The unused allowances
      `engine` to `storage` and `editor` to `engine` go.
- [ ] Commits: `test: expect lint to hold the seven-layer import table`,
      `build: teach lint the session layer`.

### Cycle 4.2: the purity of `session/`

- [ ] RED, a new row in `tests/architecture/purity-rules.test.ts`: `session/sample.ts` rejects
      `react`, `react-dom/client`, `@react-three/fiber`, `three`, `window`, and `document`, and
      accepts `setTimeout` and `crypto.randomUUID()`.
- [ ] GREEN: the first stage's `core/` blocks, extended to `session/**`.
- [ ] Commits: `test: expect lint to keep session free of React, Three.js, and DOM globals`,
      `build: hold the purity rules for the session layer`.

### Cycle 4.3: the move

- [ ] Move `bridge/session/*` to `session/editor-session/` and `bridge/autosave/*` to
      `session/autosave/`, tests with them. `session/index.ts` exports what `bridge/index.ts`
      exported for them and re-exports the `storage/` types the upper layers need (`AssetCache`,
      `ProjectSummary`, `ProjectSnapshots`). `bridge/index.ts` and `bridge/react/use-autosave.ts`
      import from `session/`. The first-stage exception entry for
      `bridge/autosave/create-autosave.test.ts` follows the file and keeps #685. `pnpm test` and
      `pnpm lint` pass with no other change.
- [ ] Commit: `refactor: move the editor session and autosave into the session layer`.

### Cycle 4.4: `bridge/` and `editor/` reach `storage/` only through `session/`

- [ ] RED in `tests/architecture/storage-through-session.test.ts`: `bridge/sample.ts` and
      `editor/sample.tsx` are rejected for a value import and for an `import type` from
      `../storage`; a file listed with `allowImportOf: 'storage'` is accepted for `storage` and
      still rejected for `../app`. In `tests/architecture/lint-exceptions.test.ts`, such an entry
      names an issue, and one whose file no longer imports `storage/` is stale. In
      `tests/architecture/session-testing-entry.test.ts`, an import of `session/testing` is
      rejected in `editor/sample.tsx` and accepted in `editor/sample.test.tsx` and
      `editor/sample.stories.tsx`.
- [ ] GREEN: `storage` leaves the allow lists of `bridge` and `editor`; `buildConfig` turns an
      `allowImportOf` entry into a per-file block that restates the layer rules with one extra
      target. The entries are the files that still import `storage/` after cycle 4.3 (re-run
      `git grep` on the day): today the three asset contexts in `bridge/react/`, the six files of
      `editor/library/` that import it, and `authoring-tool-handlers.ts`,
      `furniture-placement-context.ts`, `use-furniture-layer.ts`, `use-furniture-placement.ts`, and
      `use-plan-authoring.ts` in `editor/plan/`. The sixteen test and story files in `bridge/` and
      `editor/` that import `storage/` for the asset and library ports get entries too (for
      example `bridge/react/entity-labels.test.tsx`, `bridge/react/webgpu-scene-view.test.tsx`, and
      the `editor/library/` stories). Each entry names #717, which moves the asset and library
      ports behind the session layer. No other test or story file in those layers imports
      `storage/`: one that needs a store double takes it from `session/testing`, which this cycle
      creates with the in-memory store and asset cache, and with the `no-restricted-imports` block
      that keeps it out of production files.
- [ ] Commits: `test: expect bridge and editor to reach storage only through session`,
      `build: route storage imports from bridge and editor through session`.

### Texts

- [ ] `ARCHITECTURE.md`: "Seven-layer structure", a `session/` row in the diagram between
      `storage/` and `engine/`, the import table of ADR-0175, and the purity line. Design spec
      section 2.1 the same.
- [ ] `CLAUDE.md`, as spec section 8 words it:
  - in the repository layout, a line for `session/` between `engine/` and `storage/` reading
    "application state and logic. No React. No Three.js."; the line for `bridge/` reads "R3F glue
    and the React adapters over `session/`";
  - the sentence under the layout: "All seven source layers are live: `core/`, `storage/`,
    `session/`, `engine/`, `bridge/`, `editor/`, and `app/`";
  - a new second hard invariant: "`session/` imports no React and no Three.js and uses no DOM
    global."
- [ ] `.claude/rules.md`, rule 1: after the sentence about `engine/`, "`session/` imports no React
      and no Three.js and uses no DOM global." The closing reference becomes "See ADR-0001 and
      ADR-0175." Approval of the spec covers this text and no other.
- [ ] Commit: `docs: describe seven layers`.

---

## Pull request 5: the document handle and the flows (#685, #588)

Spec 5.4, spec 5.1 design points 4, 5, and 7, and the folder half of spec 5.3.

**Interfaces:**

```ts
// storage/locks/project-lock.ts (replaces LockManagerPort, ProjectLock, createProjectLock)
export interface ProjectLockPort {
  readonly supported: boolean
  /** The lock without waiting, or undefined when another holder has it. */
  tryAcquire(projectId: string): Promise<{ release(): Promise<void> } | undefined>
  /** Ids whose lock any tab holds, this one included. Empty when unsupported. */
  heldIds(): Promise<ReadonlySet<string>>
}
// WebLocksProjectLockPort, and InMemoryProjectLockPort(registry?: Set<string>): two instances on
// one registry behave like two tabs.

// storage/project-files/project-location.ts (in storage, so the index can use it)
export type ProjectLocation =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'folder'; readonly folderName: string }

// session/ports.ts
export interface SessionPorts {
  readonly workspace: WorkspaceDocumentStore
  readonly locks: ProjectLockPort
  readonly folders: FolderAccess // the interface of pull request 3
  readonly now: () => Date
}

// session/handle/
export type OpenFailure =
  | { readonly kind: 'open-elsewhere' | 'not-found' | 'folder-permission' | 'folder-unavailable' }
  | { readonly kind: 'did-not-open'; readonly decode: DecodeFailure }
  | { readonly kind: 'storage-unavailable'; readonly message: string }
export type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'
export type SaveOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string }
export interface DocumentHandle {
  readonly id: string
  readonly location: ProjectLocation
  readonly durable: boolean
  readonly session: EditorSession
  readonly snapshots: ProjectSnapshots
  saveStatus(): SaveStatus
  subscribe(listener: () => void): () => void
  onNotice(listener: (notice: 'saved-by-newer-build' | 'saved-with-faults') => void): () => void
  save(): Promise<SaveOutcome>
  flush(): Promise<SaveOutcome>
  close(): Promise<SaveOutcome>
}
export type OpenResult =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: OpenFailure }
export interface OpenRequest {
  readonly id: string
  readonly location: ProjectLocation
  /** When set, a missing project starts from this document instead of failing. */
  readonly create?: () => Project
}
export function openDocumentHandle(ports: SessionPorts, request: OpenRequest): Promise<OpenResult>

// session/flows/switch-project.ts
export type SwitchResult =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: { readonly kind: 'flush-failed' } | OpenFailure }
/** Flush the current project, open the target, close the current one. On failure the current
 * handle stays open. */
export function switchProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  target: OpenRequest,
): Promise<SwitchResult>
```

The other flows, one file each under `session/flows/`, take the current handle and return a
`SwitchResult` or a refusal: `createNewProject(ports, current)`; `importFile(ports, current,
{ name, bytes })`, which can also fail with `unsupported-file` or `did-not-import` and its
`DecodeFailure`; `openFolder(ports, current)`, which can also refuse with `cancelled` or
`folder-empty`; and `openRecent(ports, current, id)`. Each ends in `switchProject`, so every path
that replaces the open project writes its changes first, and no adapter installs a handle itself.
`exportArchive(handle)` gives the bytes and a file name, or a message. Pull request 8 adds
`missingAssets` to import and export. Until pull request 12, `importFile` treats a `format-rules`
failure as the global constraint says, so `did-not-import` never carries `format-rules` yet.

### Cycle 5.1: the lock port

- [ ] RED in `storage/locks/project-lock.test.ts`: on one registry, the first `tryAcquire('a')`
      gives a hold and a second port's gives `undefined`; `heldIds()` holds `'a'` for both; after
      `release()` the second acquires. With no `navigator.locks`, `WebLocksProjectLockPort` reports
      `supported: false`, gives a hold to every call, and an empty `heldIds()`.
- [ ] GREEN: the port and both classes; `WebLocksManager` becomes the private part of the browser
      class with its held-promise release.
- [ ] Commits: `test: expect one lock port with acquire and held ids`,
      `feat: hold project locks through one port`.

### Cycle 5.2: writes run one at a time

- [ ] RED in `session/handle/write-queue.test.ts`, with a store whose `save` resolves on command:
      two overlapping saves leave the second state stored, with at most two writes; three requests
      during one write give one more write, of the last state;
      `a close during an in-flight write stores the last edit`; a rejected write reports to its
      caller, and the next request still runs.
- [ ] GREEN: `createWriteQueue(write)` in `session/handle/write-queue.ts`.
- [ ] Commits: `test: expect writes to run one at a time with the last state winning`,
      `feat: order writes through one queue`.

### Cycle 5.3: opening a handle

- [ ] RED in `session/handle/open-document-handle.test.ts`:
  - the lock held on the same registry gives `open-elsewhere`, and the store was not read;
  - a missing id gives `not-found`, or with `create` a handle and nothing stored before a save;
  - a rejecting `read` gives `storage-unavailable` and bytes that are not JSON `did-not-open`; both
    release the lock;
  - a folder whose permission is `prompt` gives `folder-permission`;
  - a document that fails the check opens through `openDespiteFormatFaults` (interim) with its
    migration backup;
  - `savedByNewerBuild` emits `saved-by-newer-build`;
  - a type test finds no member of `DocumentHandle` for selection, camera, active floor, or tool
    (guard rail 2);
  - the same RED commit splits `session/autosave/create-autosave.test.ts` into one file for the
    timer and one for the write through the queue, each under the standard limit.
- [ ] GREEN: `openDocumentHandle`, over the moved `createEditorSession` and `createAutosave`, with
      autosave writing through the queue. The first-stage exception entry for
      `create-autosave.test.ts` goes.
- [ ] Commits: `test: expect opening a handle to type each failure`,
      `feat: open a project through a document handle`.

### Cycle 5.4: flush and close

- [ ] RED in `session/handle/document-handle.test.ts`: an edit followed at once by `close()` is
      stored; a `close()` whose write rejects returns `ok: false`, and the handle still saves and
      holds the lock; after a successful close the lock is free and a dispatch on the old session
      changes nothing stored; `saved-with-faults` is emitted once per handle.
- [ ] GREEN: `flush`, `close`, and the notices.
- [ ] Commits: `test: expect a close to write pending changes or stay open`,
      `feat: flush and close a document handle`.

### Cycle 5.5: the switch

- [ ] RED in `session/flows/switch-project.test.ts`:
  - the order is flush, open target, close current (a recording port);
  - an edit made just before a switch is stored;
  - a failed flush stops the switch before the target opens and leaves the current handle open;
  - a target that does not open leaves the current handle open, and `session.undo()` returns
    `true`;
  - the current id as target returns the current handle with no write;
  - a close of the current project that fails after the target opened (an edit made while the
    target loaded, and a store that then rejects) closes the target, keeps the current handle
    open with that edit, and returns `flush-failed`;
  - after a switch the old project's lock is free, so a second switch back to it opens.
- [ ] RED in `app/use-switch-notices.test.tsx`: a `flush-failed` result shows "The changes could not
      be saved, so the project stays open."
- [ ] GREEN: `switchProject` and the adapter's notice.
- [ ] Commits: `test: expect a switch to flush, open, then close`,
      `feat: switch projects without losing the current one`.

### Cycle 5.6: the flows move into `session/`

- [ ] RED, one file per flow under `session/flows/`:
  - `create-new-project.test.ts`: a new id from `newProjectId`, nothing stored before the first
    save, no discard question, and an edit made just before New project is stored;
  - `import-file.test.ts`: a `.json` file becomes a copy under a new id, the file is unchanged, two
    imports of one file give two ids, and a file that fails the check opens its migrated document
    with a warning (interim);
  - `open-folder.test.ts`: `a project opened from a folder saves back to the folder`: on an
    in-memory directory, an open, an edit, and a save leave the edit in the folder's
    `vernacular.json`, and `ports.workspace.list()` is unchanged; a known folder opens its existing
    id; a folder with no document gives `folder-empty` and nothing is remembered;
  - `open-recent.test.ts`: after switching away from a project, opening it again from the recent
    list works, because its lock is free;
  - `export-archive.test.ts`: pending changes are written before the archive is made.
- [ ] The same RED commit removes the tests of the discard prompt in front of a swap: those cases
      in `app/use-project-actions.test.ts`, `app/use-workspace-state.test.ts`,
      `app/use-discard-confirmation.test.ts`, and `app/use-discard-prompt.test.ts`, and
      `e2e/tests/discard-confirmation.spec.ts`. The cases of the recovered copy stay. It also splits
      `app/app.test.tsx` and `app/use-project-actions.test.ts` into one test file per adapter, each
      under the standard limit.
- [ ] GREEN: the flows. `app/use-project-actions.ts`, `app/use-open-file-action.ts`,
      `app/use-export-actions.ts`, and `app/use-workspace-state.ts` become adapters that call a flow
      and turn its result into a notification; none installs a handle itself. The discard prompt in
      front of New project, Open file, Open folder, and the recent list goes; the prompt for a
      recovered copy stays, and `guardSessionSwap` serves only it. The first-stage exception entries
      for `app/app.test.tsx` and `app/use-project-actions.test.ts` go.
- [ ] Commits: `test: expect each flow to run without React and return a typed result`,
      `feat: move the open, save, import, and export flows into the session layer`.

### Cycle 5.7: stores through flows, sessions through handles

- [ ] RED: in `tests/architecture/app-reaches-stores-through-flows.test.ts`, with the import graph,
      no production file in `app/` except `app/create-session-ports.ts` imports a store class,
      `ProjectStore`, `DocumentStore`, or `WorkspaceDocumentStore`, and a planted sample is named;
      in `tests/architecture/session-testing-entry.test.ts`, `session/index.ts` exports no
      `createEditorSession` (the import guard of cycle 4.4 already holds). The same RED commit
      deletes the tests of `DocumentStore.load` and of the moved `loadOrCreateProject`, and moves
      every test and story that builds a session to `createEditorSession` from `session/testing`.
- [ ] GREEN: `app/create-session-ports.ts` builds `SessionPorts`; `DocumentStore.load` and the
      moved `loadOrCreateProject` are deleted; `src/e2e-storage-hook.ts` uses `read` and the lock
      port; `session/testing/index.ts` also exports `createEditorSession` and in-memory
      `SessionPorts`.
- [ ] Commits: `test: expect app to reach stores through flows and sessions through handles`,
      `feat: build the session ports in one place`.

### Cycle 5.8: snapshots, hiding, and the notices

- [ ] RED: in `session/handle/handle-snapshots.test.ts`, autosave writes snapshots under the
      handle's id, a handle on another id sees no recovery, and the restore of a snapshot that
      fails the check gives its migrated document with a warning (interim); in
      `app/use-flush-on-hidden.test.ts`, a `visibilitychange` to `hidden` calls `flush()` once and
      the prompt before unload still shows while a write is pending; in
      `app/use-handle-notices.test.tsx`, each notice shows its sentence from decision 22 once. The
      same RED commit deletes `app/resolve-snapshot-store.test.ts` and
      `app/use-resolved-snapshots.test.ts`.
- [ ] GREEN: the handle's snapshots feed autosave; `app/use-flush-on-hidden.ts`;
      `app/use-handle-notices.ts`. `app/resolve-snapshot-store.ts` and
      `app/use-resolved-snapshots.ts` are deleted.
- [ ] Commits: `test: expect snapshots per handle and a flush when the page hides`,
      `feat: flush on hide and report save notices`.

### Cycle 5.9: the whole editor without React

- [ ] RED in `tests/session/headless-round-trip.test.ts`, importing only from `core/`, `storage/`,
      `session/`, and `session/testing`: open a stored document through `openDocumentHandle`,
      dispatch `project/rename`, undo, dispatch it again, `save()`, and `exportArchive`; the
      archive's document has the new name. A second case finds no `react`, `react-dom`, `three`,
      or `@react-three/*` module in the test file's import closure.
- [ ] Commit: `test: open, edit, undo, save, and export without React`.

### Cycle 5.10: two tabs

- [ ] `e2e/tests/second-tab.spec.ts`: one context, two pages at the bare address. The second shows
      "This project is open in another tab." in the boot view, and after an edit in the first
      settles, the stored bytes are what the first wrote. Pull request 10 changes the expectation
      to the page.
- [ ] Commit: `test(e2e): cover a second tab asking for an open project`.

---

## Pull request 6: the project index and the preview (#588)

Spec 5.5, and spec 5.4 point 5.

**Interfaces:**

```ts
// storage/project-index/project-index.ts
export interface ProjectRecord {
  readonly id: string
  readonly location: ProjectLocation
  readonly name: string | undefined
  readonly floorCount: number | undefined
  readonly preview: string | undefined // SVG text, shown through an image element
  readonly assetHashes: readonly string[]
  readonly assetListComplete: boolean // false after a best-effort read
  readonly lastChangedAt: string | undefined // from the store
  readonly lastUsedAt: string | undefined // an open or a save
  /** `reason` is the kind of the decode or open failure. */
  readonly lastOpen: { readonly opened: boolean; readonly build: string; readonly reason?: string }
}
export interface ProjectIndex {
  all(): Promise<ProjectRecord[]>
  get(id: string): Promise<ProjectRecord | undefined>
  put(record: ProjectRecord): Promise<void>
  remove(id: string): Promise<void>
}
// InMemoryProjectIndex and IndexedDbProjectIndex implement it.

export function createPlanPreview(project: Project): string | undefined // core/export/svg/
export function readStoredFacts(bytes: Uint8Array): { name?: string; assetHashes: string[] } // core/format/
export function reconcileIndex(ports: SessionPorts): Promise<ProjectRecord[]> // session/projects/
export function recentRecords(records: readonly ProjectRecord[], openId?: string): ProjectRecord[]
```

`SessionPorts` gains `index: ProjectIndex` and `build: string` (the package version).

### Cycle 6.1: the index port

- [ ] RED in `storage/project-index/project-index-contract.ts`, run by
      `in-memory-project-index.test.ts` and `indexeddb-project-index.browser.test.ts`: `put` then
      `get` is equal; `all()` lists every record; `remove` removes one; a record survives a new
      instance (browser).
- [ ] GREEN: both classes; the IndexedDB one over `vernacular-index`.
- [ ] Commits: `test: expect a project index with a browser and a memory implementation`,
      `feat: keep one record per project in a project index`.

### Cycle 6.2: the preview

- [ ] RED in `core/export/svg/plan-preview.test.ts`, on a two-floor fixture with labels and
      dimensions: no `<text` element; every wall drawn is a wall of `project.floors[0]`; no floor
      gives `undefined`; no `<script`, no `on` attribute, no external reference.
- [ ] GREEN: `createPlanPreview` over `SvgPlanExporter` with two new options, `floorIds` and
      `annotations: false`.
- [ ] Commits: `test: expect a preview of the first floor with no text`,
      `feat: draw a text-free preview of the first floor`.

### Cycle 6.3: the best-effort read

- [ ] RED in `core/format/best-effort-read.test.ts`: bytes that are not JSON give no name and no
      hashes; a document that fails the check gives its `meta.name` and the hashes of its furniture
      and underlays; a name that is not a string gives none; nothing throws.
- [ ] GREEN: `readStoredFacts`.
- [ ] Commits: `test: expect a best-effort read of a stored file's name and assets`,
      `feat: read the name and assets of a file that does not decode`.

### Cycle 6.4: the handle keeps the record

- [ ] RED in `session/handle/handle-record.test.ts`: after a save the record has the document's
      name, floor count, asset hashes, a preview, and the store's `lastChangedAt`; a rejecting
      `put` does not fail the save; an open sets `lastUsedAt` and `lastOpen` with the build; a
      failed open records its reason; with two projects in the workspace store, opening and saving
      one leaves `storedFiles` of the other identical (the umbrella's first condition).
- [ ] GREEN: the record update after each write and each open.
- [ ] Extend `tests/performance/encode-time.bench.ts` with `createPlanPreview` on the reference
      project; report both medians on `main` and the branch, and which branch of decision 21 holds.
- [ ] Commits: `test: expect the handle to keep the project's record`,
      `feat: update the project index after each save and open`; after this cycle's `refactor:`
      commit, `test: measure the preview time of the reference project`.

### Cycle 6.5: the index can be rebuilt

- [ ] RED in `session/projects/reconcile-index.test.ts`: with the index emptied, each workspace
      project's record has the same name, floor count, and preview as before; a record for a
      workspace id the store lacks is dropped, and a folder record is kept; a lost `lastUsedAt`
      takes `lastChangedAt`; bytes that are not JSON give a record with `opened: false`, the
      placeholder name, and `assetListComplete: false`, and `list()` succeeds; a project that fails
      only the strict check gets its facts from `failure.document` and a record that says it
      opened (interim, until cycle 12.3);
      `an index that rejects every call falls back to one rebuilt in memory`.
- [ ] GREEN: `reconcileIndex`.
- [ ] Commits: `test: expect the index to be rebuilt from the store`,
      `feat: rebuild missing records from the stored projects`.

### Cycle 6.6: the upgrade

- [ ] RED in `session/projects/upgrade.test.ts`: a store with only `'current'` and no index gets one
      record for it with a `lastUsedAt`, and a second call keeps it; a folder handle stored under
      `'current'` gives no folder record, the stored handle is removed, and no folder file is
      touched; a first-stage id under `vernacular.activeProjectId` becomes the latest use, and the
      key is gone. The same RED commit deletes the tests of `ActiveProjectIdStore` and its classes
      and rewrites the first-stage boot tests that read the port to read the index.
- [ ] GREEN: the upgrade step in `reconcileIndex`. `takeLegacyActiveProjectId()` in
      `storage/active-project/` reads and removes the key and returns only an id that
      `isValidProjectId` accepts. `ActiveProjectIdStore` and its classes are deleted.
- [ ] Commits: `test: expect today's project to get a record without moving`,
      `feat: carry today's project into the project index`.

### Cycle 6.7: new ids, recent entries, and a stale failure

- [ ] RED: `newProjectId` returns a UUID not in `existing`, and `isValidProjectId` still accepts
      `'project-<uuid>'`; `recentRecords` gives the five latest by use, without the open one; in
      `session/projects/recheck.test.ts`, a record that failed under another build is checked again
      and a pass clears it, and one that failed under this build is not. The same RED commit
      deletes the tests under `storage/recent/`, the recent-list case of
      `src/e2e-storage-hook.ts`'s spec, and the recent-store cases of the adapter tests, which now
      read the index.
- [ ] GREEN: the three. The Project menu reads its recent entries from the index;
      `storage/recent/` is deleted.
- [ ] Commits: `test: expect random ids, recent entries from the index, and a fresh check`,
      `feat: list recent projects from the project index`.

---

## Pull request 7: addresses and start (#588)

Spec 5.9. Until pull request 10, a screen of kind `projects` renders through the existing boot view
with its notice sentence.

**Interfaces:**

```ts
// app/address.ts
export type Place =
  | { readonly kind: 'start' | 'projects' }
  | { readonly kind: 'project'; readonly id: string }
export function parseAddress(hash: string): Place
export function addressFor(place: Place): string
// app/resolve-place.ts; a notice is did-not-open, open-elsewhere, or unknown-id, with the id
export type Screen =
  | { readonly kind: 'editor'; readonly handle: DocumentHandle }
  | { readonly kind: 'projects'; readonly notice?: PageNotice }
export function resolvePlace(
  ports: SessionPorts,
  place: Place,
  current?: DocumentHandle,
): Promise<Screen>
// session/flows/start.ts
export function startProject(ports: SessionPorts): Promise<OpenRequest>
```

`resolvePlace` reaches every project through `switchProject` of pull request 5.

### Cycle 7.1: parsing and making an address

- [ ] RED in `app/address.test.ts`: `''`, `'#'`, and `'#/'` are start; `'#/projects'` is the page;
      `'#/project/current'` and a UUID are projects, and both round-trip; `'#/project/../x'`,
      `'#/project/'`, a 200-character id, a percent-encoded slash, and `'#/project/a/b'` are start;
      `addressFor` never changes the path or the query.
- [ ] GREEN: the two functions, guarded by `isValidProjectId`.
- [ ] Commits: `test: expect project addresses to parse and round-trip safely`,
      `feat: give each project an address in the URL fragment`.

### Cycle 7.2: start and the cases of a place

- [ ] RED in `session/flows/start.test.ts` and `app/resolve-place.test.ts`, one test per case: a
      latest record opens; no record gives a request with `create` for a new id; a project that did
      not open, one open in another tab, and an unknown id each give the page with that notice; a
      store that holds only `'current'` and no index starts in that project and then has its
      record.
- [ ] GREEN: `startProject` and `resolvePlace`.
- [ ] Commits: `test: expect start and each address to resolve to a screen`,
      `feat: resolve start and addresses to a project or the page`.

### Cycle 7.3: an address with a project open

- [ ] RED in `app/resolve-place.test.ts`: with a current handle, `resolvePlace` for another
      project's address goes through `switchProject` (a recording port shows flush, open, close);
      for the current project's address it returns the current handle with no write; for an
      address whose project does not open, the current handle stays open and the page shows with
      the notice.
- [ ] GREEN: `resolvePlace` over `switchProject`.
- [ ] Commits: `test: expect an address to switch through the switch flow`,
      `feat: switch projects from an address`.

### Cycle 7.4: the history

- [ ] RED in `app/use-history-navigation.test.tsx`: start with a latest record replaces the bare
      address (one entry); each switch pushes one entry; a `popstate` to another project switches,
      and to `#/projects` shows the page with the project still open; after a switch, a fresh mount
      on the same address opens that project; a new project's address replaces the entry at its
      first save, not before; `?fixture=scene-harness` and `?e2e-storage` behave as before.
- [ ] GREEN: `app/use-history-navigation.ts`; `src/main.tsx` passes the session ports.
- [ ] Commits: `test: expect the browser history to follow projects`,
      `feat: follow project addresses through the browser history`.

### Texts

- [ ] Design spec section 5.3: a project has a random id, an address, and a record in the index,
      which remembers its backend (ADR-0188). Commit:
      `docs: describe project ids, addresses, and the project index`.
- [ ] After the merge, serve `dist/` from a static server with no rewrite rule
      (`python3 -m http.server -d dist`), open a project address, reload, use Back, and report on
      #685.

---

## Pull request 8: assets travel with documents (#673, #672)

Spec 5.6. The durable cache of point 4 landed in pull request 3.

**Interfaces:**

```ts
// storage/zip/archive-limits.ts: 512 MB, 1 GB, 10,000 entries, 64 MB. A first estimate.
export interface ArchiveLimits {
  readonly archiveBytes: number
  readonly inflatedBytes: number
  readonly entries: number
  readonly documentBytes: number
}
export const ARCHIVE_LIMITS: ArchiveLimits
// storage/zip/read-archive.ts; a failure is too-large (with the limit), not-an-archive, or
// no-document; `rejectedAssets` names entries whose bytes do not match their name.
export function readArchive(bytes: Uint8Array, limits?: ArchiveLimits): Promise<ArchiveRead>
// storage/zip/unchecked-copy.ts
export function buildUncheckedCopy(
  files: ReadonlyMap<string, Uint8Array>,
  assets: AssetCache,
  assetHashes: readonly string[],
): Promise<{ bytes: Uint8Array; includedAssets: number }>
// storage/assets/removable-assets.ts
export interface AssetUser {
  readonly id: string
  readonly assetHashes: readonly string[]
  readonly assetListComplete: boolean
}
export function removableAssets(
  deleted: string,
  users: readonly AssetUser[],
  library: ReadonlySet<string>,
): string[]
```

`exportProjectBundle` returns `{ bytes, missingAssets }` and takes `packSupplies(reference)`.
`AssetUser` is this lane's own type, so it does not wait for the record of pull request 6; pull
request 11 maps records onto it.

### Cycle 8.1: the archive limits

- [ ] RED in `storage/zip/read-archive.test.ts`, with small limits passed in: an archive above
      `archiveBytes` is refused before anything inflates; more entries, a declared total above
      `inflatedBytes`, and a declared document above `documentBytes` are refused from the central
      directory; `stops inflating an entry that passes the declared size`, for an entry that
      declares 10 bytes and inflates to 2 MB, within one chunk of the limit; `ARCHIVE_LIMITS` holds
      512 MB, 1 GB, 10,000, and 64 MB in bytes.
- [ ] GREEN: `readArchive` over fflate's streaming `Unzip`.
- [ ] Commits: `test: expect the archive reader to refuse archives above each limit`,
      `fix: refuse archives above the size and entry limits`.

### Cycle 8.2: the reader reads only the layout

- [ ] RED: entries `../x`, `/etc/passwd`, `a/../../b`, `.house-backups/x.json`,
      `.house-autosave/snapshot-1.json`, and `notes.txt` are absent from the result; the document
      and `assets/<hash>` are present.
- [ ] GREEN: the path filter.
- [ ] Commits: `test: expect the reader to take only the document and the assets`,
      `fix: ignore archive entries outside the layout`.

### Cycle 8.3: an import copies the assets

- [ ] RED in `session/flows/import-file.test.ts`: an archive with a furniture model and an underlay
      image imports into an empty workspace with each asset in the pool, same bytes; an entry whose
      bytes do not hash to its name is not in the pool; an archive that lacks one referenced asset
      imports, opens, and reports one in `missingAssets`. In `tests/storage/archive-round-trip.test.ts`,
      a project with a furniture model and an underlay image goes through `exportArchive` and
      `importFile` into an empty workspace, the document is equal apart from its id, and each
      asset has the same bytes (the umbrella's fourth condition).
- [ ] GREEN: `importFile` over `readArchive` and the codec; `importProjectFile` becomes the
      extension dispatch; the adapter shows the import sentence.
- [ ] Commits: `test: expect an import to bring its assets and report the missing ones`,
      `fix: copy the assets of an imported archive`.

### Cycle 8.4: an export reports what it leaves out

- [ ] RED in `storage/zip/export-project-bundle.test.ts`: with one asset absent from the pool, the
      file is written and `missingAssets` names one; a `pack:` asset that `packSupplies` accepts is
      neither carried nor reported.
- [ ] GREEN: the report, passed by `exportArchive` to the adapter.
- [ ] Commits: `test: expect an export to report each asset it could not include`,
      `fix: report the assets an export leaves out`.

### Cycle 8.5: which assets a delete may remove

- [ ] RED in `storage/assets/removable-assets.test.ts`: an asset only the deleted project used is
      removable; one another project or the library uses is not; while any other user has
      `assetListComplete: false`, nothing is.
- [ ] GREEN: `removableAssets`.
- [ ] Commits: `test: expect a delete to remove only assets nothing else uses`,
      `feat: decide which assets a delete may remove`.

### Cycle 8.6: the unchecked copy

- [ ] RED in `storage/zip/unchecked-copy.test.ts`: the archive holds `vernacular.json` byte for
      byte, every file of `.house-autosave/` and `.house-backups/`, and each listed asset the pool
      has; with none listed it holds none and `includedAssets` is 0; `readArchive` on it ignores the
      snapshots and backups.
- [ ] GREEN: `buildUncheckedCopy`.
- [ ] Commits: `test: expect an unchecked copy of the stored files`,
      `feat: build an unchecked copy of a project that did not open`.

The description says "Closes #673" and "Closes #672".

---

## Pull request 9: the settings port (#685)

Spec 5.11.

**Interfaces:**

```ts
// storage/settings/settings-port.ts
export interface SettingsPort {
  /** Synchronous, so the theme is known before the first paint. */
  read(name: string): unknown
  write(name: string, value: unknown): void
}
// LocalStorageSettingsPort and InMemorySettingsPort implement it.

// session/settings/settings-service.ts
export interface SettingKey<T> {
  readonly name: string
  readonly defaultValue: T
  readonly parse: (raw: unknown) => T | undefined
}
export interface SettingsService {
  get<T>(key: SettingKey<T>): T
  set<T>(key: SettingKey<T>, value: T): void
  subscribe<T>(key: SettingKey<T>, listener: (value: T) => void): () => void
}
export function createSettingsService(port: SettingsPort): SettingsService

// editor/plan/snap-preferences.ts
export const SNAP_PREFERENCES_SETTING: SettingKey<SnapPreferences>
// editor/design-system/theme.ts
export const THEME_SETTING: SettingKey<ThemeChoice>
```

`session/settings/` exports only `SettingKey<T>`, `SettingsService`, and `createSettingsService`.
No file moves from `editor/` to `session/`: `editor/plan/snap-preferences.ts` imports from
`editor/plan/snap.ts`, so the keys are defined beside the types they parse, and the service in
`session/` stays generic over them.

### Cycle 9.1: the port

- [ ] RED in `storage/settings/settings-port-contract.ts`, run for both classes: a write then a read
      returns the value, and a missing name reads `undefined`. For the browser class: JSON under
      `vernacular.settings.<name>`; a `getItem` that throws reads `undefined`; a `setItem` that
      throws keeps the value in memory; a value under `vernacular.snap-preferences` and none under
      the new name is read once as `snapPreferences`, written under the new name, and the old key
      removed.
- [ ] GREEN: both classes.
- [ ] Commits: `test: expect one settings port with a browser and a memory implementation`,
      `feat: store user settings through one port`.

### Cycle 9.2: the service

- [ ] RED in `session/settings/settings-service.test.ts`: `get` gives the default when nothing is
      stored or the value fails `parse`; `set` then `get` gives the value; a `set` notifies each
      subscriber of that key once and none of another key; an unsubscribed listener is not called.
      The test defines its own keys.
- [ ] GREEN: `createSettingsService`.
- [ ] Commits: `test: expect a settings service with typed keys and change notification`,
      `feat: add the settings service to the session layer`.

### Cycle 9.3: the two users

- [ ] RED: in `editor/plan/snap-preferences.test.ts` and `editor/design-system/theme.test.ts`,
      `SNAP_PREFERENCES_SETTING` and `THEME_SETTING` parse a valid stored value and refuse an
      invalid one; in `editor/plan/snap-preferences-store.test.ts`, preferences under the old key
      are in effect; in `editor/design-system/theme-provider.test.tsx`, with `dark` stored the first
      render has `data-theme="dark"`, and a choice in the toggle reaches the port; in
      `app/app-settings.test.tsx`, a choice then a fresh mount over the same port shows the same
      theme.
- [ ] GREEN: the two keys in `editor/`; `SettingsProvider` and `useSetting` in
      `bridge/react/settings-context.tsx` (the default context holds a memory-port service for
      tests and stories); the snap store and `ThemeProvider` read through it; `app/app.tsx` mounts the provider with
      `LocalStorageSettingsPort`. The description says that the theme now survives a reload.
- [ ] Commits: `test: expect snap preferences and the theme to come from the settings service`,
      `feat: keep snap preferences and the theme through the settings service`.

### Cycle 9.4: lint forbids storage globals outside `storage/`

- [ ] RED in `tests/architecture/storage-globals.test.ts`: samples in `core/`, `session/`,
      `engine/`, `bridge/`, `editor/`, `app/`, and `src/`, and an `editor/sample.test.tsx` and an
      `editor/sample.stories.tsx`, are rejected for `localStorage.getItem('x')`,
      `globalThis.localStorage`, `window.indexedDB`, `navigator.storage.getDirectory()`, and
      `navigator.locks.request`; `storage/sample.ts` and `e2e/tests/sample.spec.ts` accept each; no
      exception entry names these rules.
- [ ] GREEN: `no-restricted-globals` and `no-restricted-properties` for the names of decision 15;
      `app/opfs-probe.ts` moves to `storage/opfs/opfs-probe.ts`.
- [ ] Commits: `test: expect lint to forbid storage globals outside storage`,
      `build: keep browser storage APIs inside storage`.

### Texts

- [ ] Design spec section 7.7: settings are stored through the settings port, its own interface
      (ADR-0180). Commit: `docs: describe the settings port`.

---

## Pull request 10: the Projects page (#588)

Spec 5.8 (the card, a click, page actions, the rest of the page), spec 5.9 point 4, and ADR-0189.

**Interfaces** (`session/projects/project-cards.ts`):

```ts
export interface ProjectCardModel {
  readonly id: string
  readonly name: string
  readonly lastChangedAt: string | undefined
  readonly floorCount: number | undefined
  readonly location: 'browser' | 'tab' | { readonly folderName: string }
  readonly preview: { readonly svg: string } | 'did-not-open'
  readonly stateLines: readonly ('open-here' | 'open-elsewhere' | 'needs-permission')[]
  readonly actions: readonly ('rename' | 'export' | 'delete' | 'remove-from-list')[]
}
export function listProjectCards(ports: SessionPorts, openId?: string): Promise<ProjectCardModel[]>
```

The page lives in `editor/projects/` (`projects-page.tsx`, `project-card.tsx`,
`project-card-menu.tsx`, `card-text.ts`, and stories). `app/projects-screen.tsx` passes
`hrefFor(id)` built from `addressFor`, so `session/` and `editor/` know nothing about addresses.

### Cycle 10.1: the card model

- [ ] RED in `session/projects/project-cards.test.ts`: one card per record with its facts and
      location; the actions per kind are exactly `['rename', 'export', 'delete']` in the browser,
      `['rename', 'export', 'remove-from-list']` for a folder, `['export']` when open in another
      tab, and `['export', 'delete']` when it did not open; `open-here` for `openId`,
      `open-elsewhere` for another id in `heldIds()`, `needs-permission` for a folder at `prompt`;
      a workspace that is not durable gives `'tab'`; a failed `lastOpen` gives `'did-not-open'`.
- [ ] GREEN: `listProjectCards`, the only reader of `heldIds()` (guard rail 1).
- [ ] Commits: `test: expect a card model with the facts, lines, and actions of each kind`,
      `feat: model the project cards from the index and the lock state`.

### Cycle 10.2: the page and the card

- [ ] RED in `editor/projects/projects-page.test.tsx`:
  - each card shows its name, "Changed &lt;time&gt;", its floors, and "In this browser.", "Folder:
    &lt;name&gt;", or "In this tab only.";
  - `'did-not-open'` shows "This project did not open." in place of the image; a drawing shows
    through an `img` with a `data:image/svg+xml` URL, and no preview SVG is in the page's markup;
  - "Already open in this tab.", "Already open in another tab.", and "This folder needs permission
    again." have no `button` role and cannot take focus, and the card's description includes them;
  - each card is an `a` with `href` from `hrefFor`, reached with Tab;
  - with no card, "There are no saved projects yet." and the page actions; with a project open,
    "Back to &lt;name&gt;" at the top.
- [ ] GREEN: the components, from the design system's components.
- [ ] Commits: `test: expect the Projects page to show one card per project`,
      `feat: show the Projects page`.

### Cycle 10.3: a click on a card

- [ ] RED in `app/projects-screen.test.tsx`: the open project's card and "Back to &lt;name&gt;"
      return with `session.canUndo()` as it was; another card switches with no prompt; a card open
      in another tab tries, the page and the line stay, and the page reads the lock state again
      when it becomes visible; a card that did not open tries again and shows its reason sentence
      in a notification (pull request 12 replaces it with the dialog); a folder card that needs
      permission calls `reopen`, and a refusal changes nothing.
- [ ] RED in `app/app-failed-load.test.tsx`: a stored project that does not open at start shows the
      page; New project there gets its own id; an edit and an autosave leave every file of the
      failed project byte-identical (the first-stage guarantee, now through the page).
- [ ] GREEN: `app/projects-screen.tsx` renders a `projects` screen in place of the interim view.
      From here `bootErrorView` shows only when the workspace storage cannot be found; pull request
      13 removes it.
- [ ] Commits: `test: expect a click on each kind of card to do what the spec says`,
      `feat: open, return to, and retry projects from their cards`.

### Cycle 10.4: page actions and the menu

- [ ] RED: the page actions are New project, Import file, and Open folder, the last only where
      `folders.supported`; in `editor/shell/project-menu.test.tsx` the entries read New project,
      Switch projects, Import file, Open folder, Save, Rename, then the recent projects, and "Open
      file" is gone; Switch projects shows the page with the project still open; a file dropped on
      the page imports as a copy.
- [ ] GREEN: the page actions over the flows, the menu order, and Switch projects.
- [ ] Commits: `test: expect the page actions and the Project menu order`,
      `feat: start, import, and open folders from the Projects page`.

### Cycle 10.5: stories and the second tab

- [ ] Stories for the empty page, one card of each kind, and a project open. Story baselines
      refresh on the CI runner, as the Storybook job does.
- [ ] `e2e/tests/second-tab.spec.ts` now expects the page, with "Already open in another tab." and
      Export as the card's only action.
- [ ] Design spec section 5.6: the second tab shows the Projects page, and the read-only prompt
      goes (ADR-0189).
- [ ] Commits: `test: add stories for the Projects page`,
      `test(e2e): expect a second tab to show the Projects page`,
      `docs: describe what a second tab shows`.

---

## Pull request 11: card actions (#588)

Spec 5.8 (rename, export, delete), and the wiring of spec 5.6 point 7. The flows, one file each in
`session/flows/`: `renameProject(ports, current, id, name)`, `exportProject(ports, current, id)`
(an `archive` with `missingAssets`, or an `unchecked-copy` with `includedAssets`),
`deleteProject(ports, current, id, libraryHashes)`, and `removeFolderFromList(ports, id)`.

### Cycle 11.1: rename

- [ ] RED in `session/flows/rename-project.test.ts`: a rename of a closed project opens a handle,
      dispatches `project/rename`, saves, and closes, and the stored document and the record have
      the new name; a rename of the open project dispatches on its session; the card action and the
      menu entry both call `renameProject`.
- [ ] GREEN: the flow and the card's rename form.
- [ ] Commits: `test: expect a rename of a closed project through the rename command`,
      `feat: rename a project from its card`.

### Cycle 11.2: export

- [ ] RED in `session/flows/export-project.test.ts`: the open project writes pending changes first;
      a project open in another tab exports the stored document; a project that did not open gives
      an `unchecked-copy` with the stored document byte for byte, its snapshots, and its backups; an
      ordinary export holds no snapshot and no backup. In `app/projects-screen.test.tsx`, the
      unchecked copy shows "This copy was not checked, because the project did not open.", says so
      when it holds no asset, and its file name ends in `-unchecked-copy.building`.
- [ ] GREEN: the flow and the card action.
- [ ] Commits: `test: expect Export on every card`, `feat: export any project from its card`.

### Cycle 11.3: delete, and remove from list

- [ ] RED:
  - `editor/projects/delete-project-dialog.test.tsx`: `Delete "<name>"?`, then "This removes the
    project and its recovery copies from this browser. You cannot undo this action.", the controls
    Cancel and "Delete project", and Cancel focused;
  - `session/flows/delete-project.test.ts`: the other projects' `storedFiles` are identical, and the
    store, the index, and the pool hold nothing only the deleted project used; an asset another
    project or the library uses stays; `a workspace id with no record blocks every asset removal`;
    `a record older than its stored document blocks every asset removal` (the record's
    `lastChangedAt` differs from the one the store lists); an asset that the open project added
    and had not saved when the delete of another project started stays; Cancel counts no write; deleting the open project closes its handle first, then deletes, the
    page stays, and no project is open;
  - the lock: while a second port on the same registry holds the lock, the delete fails with
    `open-elsewhere` and every file is byte-identical; while the delete runs (a store whose delete
    resolves on command), a second port's `tryAcquire` gives `undefined`; the lock is free
    afterward;
  - `removeFolderFromList` forgets the handle and the record, every file of the folder (an
    in-memory directory) is byte-identical, and the action shows no dialog.
- [ ] GREEN: the dialog and the flows. `deleteProject` calls `ports.locks.tryAcquire(id)` before it
      removes anything and holds the lock until the store, the index, and the pool are done, then
      releases it; when another holder has the lock it fails with `open-elsewhere` and removes
      nothing. It builds the asset users for `removableAssets` from `ports.workspace.list()`, not
      from the records alone: every workspace id with no record is a user with
      `assetListComplete: false`, and so is every id whose record carries a `lastChangedAt` other
      than the one the store lists, because decision 21 lets a record lag its document and a failed
      `put` leaves the old record. It flushes the open project before it computes the users, so
      that project's record is current. `listProjectCards` stays the only reader of `heldIds()`.
- [ ] Commits: `test: expect a delete to remove only what that project used`,
      `feat: delete a project or remove a folder from the list`.

### Cycle 11.4: the journey

- [ ] `e2e/tests/journeys/two-projects.spec.ts`: make a project and draw a wall, make a second from
      the page and draw two, switch back through the page, reload (the same project opens), then
      Back and Forward across both projects and the page, checking the wall count at each step.
- [ ] Commit: `test(e2e): cover two projects, a switch, a reload, and the history`.

### Texts

- [ ] First-stage spec section 5.2: an unchecked copy carries snapshots and backups, and an ordinary
      export still does not (ADR-0191). Commit: `docs: describe the unchecked copy`.

The description says "Closes #588".

---

## Pull request 12: a project that does not open (#631)

Spec 5.7. The refusal goes live here, together with the dialog.

**Interfaces** (`core/repairs/repair-list.ts`, exported from `core/index.ts`):

```ts
export interface DataRemovingRepair {
  readonly id: 'mixed-paint-entry' | 'undefined-fields'
  recognizes(document: unknown): boolean
  /** The repaired document and the JSON pointers of what was removed. */
  apply(document: unknown): { readonly document: unknown; readonly removed: readonly string[] }
  /** One sentence, such as "It removes the extra data from 2 paint entries." */
  describe(removed: readonly string[]): string
}
export const DATA_REMOVING_REPAIRS: readonly DataRemovingRepair[]
export interface RepairOffer {
  readonly document: Project
  readonly sentences: readonly string[]
  readonly removedPaths: readonly string[]
}
export function findRepairOffer(document: unknown): RepairOffer | undefined
```

The `did-not-open` member of `OpenFailure` gains `readonly repair?: RepairOffer`.

`undefined-fields` finds a field with `KNOWN_KEYS` as the graft does, so a key that any union
variant defines is known to it. That is why the mixed paint entry needs its own repair.

### Cycle 12.1: the two entries

- [ ] RED in `core/repairs/repair-list.test.ts`: two `solid` paint entries that carry pattern
      fields are recognized by `mixed-paint-entry`, the result passes the strict check, and the
      sentence is "It removes the extra data from 2 paint entries."; `x-old` on a floor and
      `x-older` in the meta are recognized by `undefined-fields`, `removed` is
      `['/floors/0/x-old', '/meta/x-older']`, and the sentence is "It removes 2 fields that the
      format does not define."; neither removes anything inside `extensions`; each keeps every
      other value of its input.
- [ ] GREEN: the two entries and the list.
- [ ] Commits: `test: expect a repair for mixed paint entries and for undefined fields`,
      `feat: list the repairs that remove data`.

### Cycle 12.2: the offer

- [ ] RED in the same file:
      `offers one repair for a document with both a mixed paint entry and an undefined field`, with
      both sentences; a missing required field gets no offer, and so does a document that still
      fails after every entry; a document that passes gets none. The same RED commit updates
      `tests/architecture/codec-only-callers.test.ts` so that files under `core/repairs/` may call
      `checkCurrentSchema`, and only that name.
- [ ] GREEN: `findRepairOffer`, which checks the repaired document with `checkCurrentSchema`.
- [ ] Commits: `test: expect one offer only when the repaired document passes`,
      `feat: offer a repair only when it yields a valid document`.

### Cycle 12.3: the refusal

- [ ] RED in `session/flows/open-failed.test.ts`, with a store that counts writes: a project with
      two mixed paint entries gives `did-not-open` with `format-rules` and a `repair` naming 2 paint
      entries; until the user chooses, no write is counted. The same RED commit turns each interim
      case into a refusal: the folder-store case of cycle 2.5, the open-step case of cycle 5.3
      (which took over the `load()` case of cycle 3.2 when cycle 5.7 deleted `load()`), the `importFile` case of cycle 5.6 (now `did-not-import` with
      `format-rules`), the snapshot cases of cycles 2.5 and 5.8, and the `reconcileIndex` case of
      cycle 6.5 (the record now says it did not open). For a snapshot, the restore offers no
      recovery and says "A recovery copy could not be read. It is kept with the project's backups.",
      and after the next autosave the refused snapshot is under `.house-backups/` byte for byte.
- [ ] GREEN: every read path stops using `failure.document`; `openDespiteFormatFaults` is deleted
      with its file; the failure carries `repair: findRepairOffer(failure.document)`. A snapshot
      that fails decode is moved to the project's backups by the backup rule before any prune
      runs, so the unsaved work in it is never removed without the user.
- [ ] Commits: `test: expect a document that breaks the format rules not to open`,
      `feat: refuse to open a document that breaks the format rules`.

### Cycle 12.4: the dialog

- [ ] RED in `editor/projects/failed-open-dialog.test.tsx`:
  - the title is "This project did not open.";
  - one sentence per cause: `format-rules` "A part of the project breaks the format rules.",
    `newer-version` "A newer version of Vernacular made this project.", `not-json` and
    `not-a-project` "The stored file is not a Vernacular project.", `migration-failed` "Vernacular
    could not bring this project up to the current format.", `storage-unavailable` "The storage did
    not answer.", `folder-unavailable` "The folder is not available.";
  - then "The stored project is kept unchanged." and "You can export a copy from the Projects
    page.";
  - a closed details element holds the error, the paths, the format version, and the build, and
    lists each path the general repair removes;
  - Close and Export; "Try again" only for `storage-unavailable` and `folder-unavailable`; no
    control that starts a new project; with an offer, its sentences and "Open with the repair".
- [ ] GREEN: the dialog and `failure-sentences.ts`.
- [ ] Commits: `test: expect the failed-open dialog to state the reason and the way out`,
      `feat: show why a project did not open`.

### Cycle 12.5: the repair choices

- [ ] RED in `session/flows/open-failed.test.ts` and
      `editor/projects/repair-choice-dialog.test.tsx`: "Open as a new project" comes first and is
      primary, leaves the stored bytes identical, and adds "&lt;name&gt; (repaired copy)", which
      decodes; "Replace the stored project" shows "The data that the repair removes is lost. You
      cannot undo this action.", stores the repaired document, and leaves a backup with the
      original bytes; Cancel returns to the dialog and writes nothing; for a folder project, a new
      project goes to the workspace and a replace writes into the folder; with another project
      open while the page shows, either choice opens its project through `switchProject`, and an
      edit made in the open project just before the choice is stored.
- [ ] GREEN: `openRepairedAsNew` and `replaceWithRepaired` in `session/flows/open-failed.ts`, and
      the choice dialog. Both take the current handle and end in `switchProject`, like every flow
      that replaces the open project.
- [ ] Commits: `test: expect a repaired copy or a replace with a backup`,
      `feat: open a repaired project as a new one or replace the stored one`.

### Cycle 12.6: where the dialog shows, and a failed import

- [ ] RED in `app/projects-screen.test.tsx`: the dialog shows on the page at start when the most
      recent project did not open, after a click on such a card, and after an address that names
      one, and Close returns to the page; a failed import shows it with no Export and no replace
      choice; an archive over a limit gives "The file is larger than Vernacular can open."
- [ ] GREEN: the page mounts the dialog; the notification of cycle 10.3 goes.
- [ ] Commits: `test: expect the dialog at start, on a card, at an address, and after an import`,
      `feat: show the failed-open dialog on the Projects page`.

### Cycle 12.7: the journey and the texts

- [ ] `e2e/tests/journeys/failed-open-repair.spec.ts`: a stored project with a mixed paint entry
      (planted through `src/e2e-storage-hook.ts`) shows the dialog at start; "Open with the
      repair", then "Open as a new project", opens the copy; a reload shows two cards, and the
      first project's stored bytes are unchanged.
- [ ] Format spec sections 7 and 8 and design spec section 5.5: the application refuses a document
      that fails validation, keeps the bytes, and offers export and repair; the sentence that rules
      out a hard rejection is replaced (ADR-0190).
- [ ] Commits: `test(e2e): cover a repaired copy of a project that did not open`,
      `docs: describe the refusal and the repairs`.

The description says "Closes #631".

---

## Pull request 13: temporary storage says so (#591)

Spec 5.10.

### Cycle 13.1: every way in raises the banner

- [ ] RED in `app/temporary-storage.test.tsx`: with neither durable backend, the banner shows once a
      handle opens; with a storage lookup that throws, the workspace is in memory, the banner
      shows, and the page lists the projects made there; a switch between them asks nothing; the
      banner shows on the page and in the editor with the text of decision 22. In
      `app/app-failed-load.test.tsx`, a lookup that throws never shows "Start a new project".
- [ ] GREEN: `openDocumentHandle` takes `durable` from the store;
      `app/use-degraded-storage-banner.ts` raises the banner when a handle on a store that is not
      durable opens; `app/create-session-ports.ts` builds a memory workspace when the lookup
      throws. `bootErrorView`, its "Start a new project" control, and `startFreshProject` are
      deleted.
- [ ] Commits: `test: expect every way into temporary storage to raise the banner`,
      `fix: raise the storage banner whenever a project lives in the tab`.

### Cycle 13.2: the save status and the card

- [ ] RED: on a store that is not durable, `saveStatus()` is never `'saved'` and is `'tab-only'`
      after a write (`session/handle/document-handle.test.ts`); `'tab-only'` reads "In this tab
      only" (`app/temporary-storage.test.tsx`); the card reads "In this tab only."
      (`app/temporary-storage.test.tsx`); a folder project opened from a temporary workspace is
      durable, and its record is in the memory index only.
- [ ] GREEN: `'tab-only'` joins `SaveStatus` and the label maps in `editor/shell/editor-shell.tsx`.
- [ ] Commits: `test: expect temporary storage never to read as saved`,
      `fix: say that a project in temporary storage lives in this tab`.

### Texts

- [ ] First-stage spec section 5.3: the "Start a new project" control is removed, and the page has
      New project (ADR-0190). Commit: `docs: describe the removal of the start-new control`.

The description says "Closes #591".

---

## Pull request 14: a save that finds a newer stored file (#741)

Not in the spec. On 2026-11-16 the owner decided the newer-file case of #741 as "keep both files":
when a save finds a stored file that a newer build wrote, the save writes this document beside the
newer file and tells the user, with a second file name, a notice, and a way to choose between the
two. The other half of #741, the report of a dropped graft, lands in cycles 2.4 and 3.2. Until this
pull request lands, a save over a newer file replaces it, as it does today, and only warns.

The lock of ADR-0189 keeps two tabs of one browser out of this case. It does not keep out a sync
tool, a second device, or another program that writes a picked folder, so the case is mostly that
of a folder project.

**Before it starts.** The spec and the decision records do not hold this behavior, and some of
their text contradicts it. A specification amendment with a decision record settles it first; the
orchestrator assigns the record's number. The amendment changes:

- first-stage spec section 5.1 point 6, which says a save over a file at a newer version goes on
  without a graft, so the newer file is replaced;
- format spec section 2.2, whose folder layout holds one document, `vernacular.json`, and no second
  document file;
- spec section 5.3 points 5 and 8, if the second file sits in the project's directory: `list()`
  finds a project by its document file, and a folder project follows the format's layout;
- ADR-0184, which #741 asks to state the three cases of a save with no graft and what the store
  does in each;
- spec section 5.3 point 7, "The picked-folder store never removes a file from the folder", and the
  last line of its "Done when", "No method of the picked-folder store removes a file it did not
  write". The choice of the user may remove the other file (point 5 below), and this case is mostly
  a folder project, so the amendment states whether the choice may remove a file that this build
  did not write;
- design spec section 3.3, whose layout shows one document per project folder (`project.json`),
  and ADR-0047, whose decision 1 names `vernacular.json` as the one canonical Document of a
  project.

Open design points for the amendment:

1. The second file's name and place: beside `vernacular.json` under a name the format reserves, or a
   new project with its own id. Whether an archive store keeps both at all.
2. Where the next saves go once both files exist.
3. What the next open does. This build refuses the newer file (`newer-version`, and ADR-0190 has no
   read-only mode), so the open must find the second file, or this build cannot reach the user's
   work.
4. The notice: its wording (decision 22 has none), when it shows, and how often.
5. How the user chooses, and where: on the card, in the failed-open dialog, or both. What each
   choice does with the other file (kept as a backup, exported, or removed), and what the record
   and the card show while both files exist.
6. Whether a higher `schemaRevision` at the same version counts as a newer build. The graft already
   keeps the added fields of such a file, so today only a higher `schemaVersion` drops the graft.
7. Which store kinds the conformance suite runs the case on.

The cycles below are an outline. The amendment fixes their names, files, and sentences.

### Cycle 14.1: the store keeps both files

- [ ] RED in `storage/documents/document-store.test.ts`: a save whose previous file decodes as
      `newer-version` leaves that file byte-identical, writes this document under the second name,
      and its report names the second file; the next save goes where the amendment says (point 2);
      the case of cycle 3.2 that expects the newer file replaced changes with it. A conformance case
      checks that the newer file survives a save byte for byte on each target the amendment names.
- [ ] GREEN: `DocumentStore.save`.
- [ ] Commits: `test: expect a save to keep a newer stored file and write beside it`,
      `fix: keep a newer stored file and save beside it`.

### Cycle 14.2: the user is told

- [ ] RED in `session/handle/document-handle.test.ts`: a save that kept both files emits its notice
      as often as the amendment says; in `app/use-handle-notices.test.tsx`, the notice shows its
      sentence.
- [ ] GREEN: the notice joins `onNotice` and the adapter.
- [ ] Commits: `test: expect a notice when a save keeps both files`,
      `feat: tell the user when a save keeps both files`.

### Cycle 14.3: the user chooses

- [ ] RED in `session/flows/choose-kept-file.test.ts` and in the test of the control the amendment
      names: each choice leaves the files the amendment says; nothing is removed before the user
      chooses; the next open reaches this build's file.
- [ ] GREEN: the flow and its control.
- [ ] Commits: `test: expect a choice between the two kept files`,
      `feat: choose between the two kept files`.

### Texts

- [ ] The amendment, its record, and the ADR-0184 text are approved and landed in their own
      documents change before this pull request starts, as the sections above say. Commit:
      `docs: describe a save that keeps a newer stored file`.

The description says "Closes #741".

---

## After pull request 13

Pull request 13 ends the stage. Pull request 14 waits for a specification amendment that has no
date, so it lands after #685 closes and is tracked by #741, not by this list.

- [ ] No entry in the lint exception list names #685. If one does, its file is split first.
- [ ] After pull requests 5 and 7, check the skill notes under `.claude/skills/` for six layers,
      `bridge/session/`, one project slot, `'current'` as the only id, and the recent-project
      store, and refresh what is stale.
- [ ] Once pull request 13 has merged, close #685 and tick the second line of the list in #682.
      Do not wait for pull request 14.
- [ ] File an issue for anything a lane scoped down.

## Coverage

Bullets are numbered in the order of each "Done when" list.

| Spec | Bullet                                                                          | Cycle                    |
| ---- | ------------------------------------------------------------------------------- | ------------------------ |
| 5.1  | 1 Session rejects React, Three.js, bridge, editor, engine                       | 4.1, 4.2                 |
| 5.1  | 2 Bridge and editor reject storage imports, type-only too                       | 4.4                      |
| 5.1  | 3 No file in app calls a store                                                  | 5.7                      |
| 5.1  | 4 Four documents describe seven layers                                          | 4, texts                 |
| 5.2  | 1 A fixture per version, valid, decodes                                         | 1.1, 1.2, 2.3            |
| 5.2  | 2 Unknown field at the current revision fails with its path                     | 2.3                      |
| 5.2  | 3 Higher revision decodes, keeps the field, reported                            | 2.3, 2.4, 5.3, 5.8       |
| 5.2  | 4 Mixed paint entry fails                                                       | 2.3                      |
| 5.2  | 5 Higher version fails with its reason                                          | 2.3                      |
| 5.2  | 6 Encode writes the revision; drift test needs an increment                     | 2.1, 2.4                 |
| 5.2  | 7 Invalid encode gives bytes and errors; store keeps a backup                   | 2.4, 3.2                 |
| 5.2  | 8 Every command leaves a valid document                                         | 2.6                      |
| 5.2  | 9 No other caller of migration, helpers, validators                             | 2.7                      |
| 5.3  | 1 Every store passes the suite                                                  | 3.6                      |
| 5.3  | 2 Folder project saves to its folder; workspace gains nothing                   | 5.6                      |
| 5.3  | 3 After a delete, nothing under the id                                          | 3.1, 3.2                 |
| 5.3  | 4 No picked-folder method removes a file it did not write                       | 3.3                      |
| 5.4  | 1 The session constructor is not exported                                       | 5.7                      |
| 5.4  | 2 Second open fails as open elsewhere, unit and two pages                       | 5.3, 5.10, 10.5          |
| 5.4  | 3 Edit then close is stored                                                     | 5.4                      |
| 5.4  | 4 Close whose write fails stays open                                            | 5.4                      |
| 5.4  | 5 Overlapping saves leave the last state                                        | 5.2                      |
| 5.4  | 6 Open, edit, undo, save, export with no React                                  | 5.9                      |
| 5.5  | 1 Two projects; saving one leaves the other identical                           | 6.4                      |
| 5.5  | 2 A new project has a UUID; two imports differ                                  | 6.7, 5.6                 |
| 5.5  | 3 Only `'current'`, no index: starts there, then has a record                   | 7.2                      |
| 5.5  | 4 Index emptied: same name, floors, preview                                     | 6.5                      |
| 5.5  | 5 Bytes not JSON: record says so, list succeeds                                 | 6.5                      |
| 5.5  | 6 After a save: name, floors, assets                                            | 6.4                      |
| 5.5  | 7 Preview: no text, first floor only                                            | 6.2                      |
| 5.6  | 1 Export and import into an empty workspace are equal                           | 8.3                      |
| 5.6  | 2 A missing asset in an archive is reported                                     | 8.3                      |
| 5.6  | 3 An export with an absent asset reports one                                    | 8.4                      |
| 5.6  | 4 Each limit refuses; small archive that inflates large                         | 8.1                      |
| 5.6  | 5 A mismatched hash is not in the cache                                         | 8.3                      |
| 5.6  | 6 Delete removes only-used, keeps shared and library assets                     | 8.5, 11.3                |
| 5.7  | 1 Two mixed paint entries: no open, sentence, line about 2                      | 12.1, 12.3, 12.4         |
| 5.7  | 2 No write until the user chooses                                               | 12.3                     |
| 5.7  | 3 Open as new: bytes identical, second project passes                           | 12.5                     |
| 5.7  | 4 Replace stores the repair and backs up the original                           | 12.5                     |
| 5.7  | 5 One undefined field: general repair, path in details                          | 12.1, 12.4               |
| 5.7  | 6 Still failing after every entry: no offer                                     | 12.2                     |
| 5.7  | 7 Each cause yields its sentence                                                | 12.4                     |
| 5.7  | 8 No control starts a new project                                               | 12.4, 13.1               |
| 5.7  | 9 A failed import has no Export and no replace                                  | 12.6                     |
| 5.8  | 1 One card per record with the four facts                                       | 10.1, 10.2               |
| 5.8  | 2 A state line has no button role and no focus                                  | 10.2                     |
| 5.8  | 3 Each kind offers exactly its actions                                          | 10.1                     |
| 5.8  | 4 Rename of a closed project changes document and card                          | 11.1                     |
| 5.8  | 5 Delete leaves others identical and nothing orphaned; Cancel                   | 11.3                     |
| 5.8  | 6 Remove from list leaves every file, no dialog                                 | 11.3                     |
| 5.8  | 7 Unchecked copy byte for byte with snapshots, backups, notice                  | 8.6, 11.2                |
| 5.8  | 8 Journey: two projects, switch, reload, back                                   | 11.4                     |
| 5.9  | 1 Latest record, no record, did not open, other tab, unknown id                 | 7.2                      |
| 5.9  | 2 After a switch, a reload opens the open project                               | 7.4, 11.4                |
| 5.9  | 3 An edit just before a switch is stored                                        | 5.5, 5.6                 |
| 5.9  | 4 A target that does not open keeps the current one and undo                    | 5.5, 7.3                 |
| 5.9  | 5 Back and Forward across two projects and the page                             | 11.4                     |
| 5.10 | 1 Each way into temporary storage raises the banner                             | 13.1                     |
| 5.10 | 2 The save status never shows saved                                             | 13.2                     |
| 5.10 | 3 The card reads "In this tab only."                                            | 13.2                     |
| 5.11 | 1 Snap preferences under the old key are in effect                              | 9.1, 9.3                 |
| 5.11 | 2 A theme choice survives a reload                                              | 9.3                      |
| 5.11 | 3 Lint rejects `localStorage` in editor, accepts it in storage                  | 9.4                      |
| 5.11 | 4 A change notifies subscribers                                                 | 9.2                      |
| 5.12 | 1 Lock taken by open and by delete only; lock state read by the card model only | 5.3, 10.1, 11.3          |
| 5.12 | 2 The handle holds no window state                                              | 5.3                      |
| 5.12 | 3 Every change through dispatch, a closed rename included                       | 11.1                     |
| 5.12 | 4 Random ids; `'current'` the one exception                                     | 6.7                      |
| 5.12 | 5 The command-layer spec carries the condition                                  | not code                 |
| 7    | Umbrella 1: two projects coexist                                                | 6.4                      |
| 7    | Umbrella 2: a folder project saves back to its folder                           | 5.6                      |
| 7    | Umbrella 3: one suite; migrate, preserve, keep assets                           | 3.6                      |
| 7    | Umbrella 4: archive round trip is identical                                     | 8.3                      |
| 7    | Umbrella 5: every version from 8 opens through every store                      | 1.2, 2.3, 3.6            |
| 7    | Umbrella 6: open, edit, undo, save, export with no React                        | 5.9                      |
| 7    | #588                                                                            | 3.6, 5.5, 5.6, 6.4, 11.4 |
| 7    | #591                                                                            | 13.1, 13.2               |
| 7    | #631                                                                            | 2.3, 12.3                |
| 7    | #672                                                                            | 2.5, 3.5, 3.6, 8.3       |
| 7    | #673                                                                            | 8.3                      |
| none | #734 The previous file is current on every registry version before the graft    | 2.4                      |
| none | #741 A dropped graft is reported with its reason                                | 2.4, 3.2                 |
| none | #741 A save keeps a newer stored file, tells the user, and offers a choice      | 14.1, 14.2, 14.3         |
| none | #741 ADR-0184 states the three cases of a save with no graft, and each outcome  | open (see below)         |

The third "Done when" of #741 has no cycle yet. The plan leaves its timing open: the owner decides
whether pull request 3 states the two cases it settles (a previous file that is not JSON, and one
whose migration throws) or whether all three wait for the amendment of pull request 14, which
settles the newer-file case.
