# Data-loss fixes and guard rails: implementation plan

> **For agentic workers:** run every cycle from the main thread with the role-separated agents of
> this repository: `/test-first`, `/implement`, `/clean-code-review`, `/refactor`. A background
> agent cannot dispatch them. Tick the checkboxes as the work lands.

**Goal:** close #669, #670, #671, #678, #683, and #684, so that saved data survives the four known
loss paths and the later stages of the architecture refactor round start behind working checks.

**Architecture:** eight pull requests in four lanes. Each fix is cut so the persistence stage (#685)
takes it over unchanged: the table of known keys and the graft are pure, the active project id sits
behind a small port, and the performance counts are defined by what can be observed.

**Tech stack:** TypeScript, Vitest (unit project, jsdom), ESLint flat config, the TypeScript
compiler API for the import graph, Playwright for the end-to-end case, Vitest browser mode for the
timing report.

**Spec:** `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`. Records: ADR-0182 to
ADR-0186. Read the spec section named in each pull request before starting it. The "Done when"
lists there are the acceptance tests; this plan says where each one lives and what it is called.

## Global constraints

- Every document from schema version 8 onward still opens after every pull request. The format
  suites under `tests/format/` check this.
- No new runtime dependency. A new development dependency must be older than the 30-day cooldown
  and pinned exactly. This plan needs none.
- Browser storage APIs stay inside `storage/`.
- No lint rule is switched off, for the repository or for a file, to reach zero warnings. The
  exception list of pull request 1 is the only place where a limit is raised.
- A file on the exception list is capped at its measured size. New tests for `app/app.tsx`,
  `app/use-project-actions.ts`, `bridge/autosave/create-autosave.ts`, and the other capped files go
  into new test files, never into the capped one.
- No fix may be one that the persistence stage has to undo.
- Application code follows the red, green, blue cycle: `test:`, then `feat:` or `fix:`, then
  `refactor:` (an empty marker when the review finds nothing). Tooling cycles (lint configuration,
  CI selection, scripts) keep the test-first order with `test:` then `build:` or `ci:`.
- No decision record is needed beyond ADR-0182 to ADR-0186. If a lane finds that it needs one, the
  orchestrator assigns the number. A lane never scaffolds a record on its own.
- Each pull request passes `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
  `pnpm build`, and `pnpm rgb:audit --range origin/main..HEAD`, each checked for its own exit code.
  `/clean-code-review` and `/review` run before it merges. It merges with a merge commit.

## Decisions this plan makes

The spec leaves these to the builder. They are fixed here so that two lanes cannot choose
differently.

1. **One list of commands.** `registerAllProjectCommands` in `core/` registers all thirteen handler
   groups (68 commands), and the editor session calls it. Today the session registers twelve groups
   by hand and leaves out the five project palette commands, which nothing dispatches. After pull
   request 3 they are registered in the live session. Two lists is how they were left out.
2. **The table of known keys is a JSON file**, `core/model/known-keys.json`, with a small typed
   reader beside it. A JSON file is compared byte for byte like the schema and stays out of the
   format and line-count checks.
3. **The graft stays in `storage/folder/preserve-unknown.ts`** for now. Moving the file is the same
   work in either stage.
4. **The cycle rule is a test** that reads the import graph with the TypeScript compiler. No new
   dependency, and `verbatimModuleSyntax` already marks every type-only import in the syntax.
5. **The two `bridge/` tests that import `three`** get what they need from `engine/testing`.
6. **The active project id is kept in `localStorage`** under the key `vernacular.activeProjectId`,
   behind an asynchronous port, so the settings port or the document handle can take it over.
7. **The timing report runs in a Vitest browser-mode project** that only its command runs, so
   nothing is added to the production entry. Pull request 8 names the fallback.

## Review focus

Inputs the spec implies and no "Done when" line covers. Each has a test in the cycle named.

1. The remembered project id is damaged or hostile (`../x`, an empty string, 200 characters). The
   application treats it as nothing remembered and opens `'current'`. Cycle 6.1.
2. Two tabs sit on the failure dialog and both start a new project. Each gets its own id, and
   neither writes under the failed id or the other tab's id. Cycle 6.5.
3. The backup write fails (storage full) before a migration. The load fails, the stored file is
   unchanged, and no migration runs without a backup. Cycle 5.1.
4. The previous file parses as JSON but is not an object (`[]`, `null`, a string). The save goes
   through without a graft. Cycle 4.4.
5. The browser window of the timing report is hidden, so frames do not advance. The command says it
   could not measure and writes nothing. Cycle 8.3.

---

## Order and lanes

| #   | Pull request                                     | Branch                                   | Issue | Lane        | Starts after |
| --- | ------------------------------------------------ | ---------------------------------------- | ----- | ----------- | ------------ |
| 1   | Lint that holds                                  | `fix/lint-warnings-fail-ci`              | #683  | Lint        | (first)      |
| 2   | Small corrections                                | `docs/refactor-round-small-corrections`  | none  | Lint        | 1            |
| 3   | Commands keep `extensions`, with the key table   | `fix/commands-keep-extensions`           | #678  | Saved data  | 1            |
| 4   | A cleared field stays cleared                    | `fix/cleared-fields-stay-cleared`        | #669  | Saved data  | 3            |
| 5   | Migration backups outlive autosave               | `fix/migration-backups-outlive-autosave` | #670  | Saved data  | 4            |
| 6   | A project started after a failed load            | `fix/new-project-after-failed-load`      | #671  | Failed load | 1            |
| 7   | Performance count gates                          | `feat/performance-count-gates`           | #684  | Performance | 1            |
| 8   | Performance timing report and the first baseline | `feat/performance-timing-report`         | #684  | Performance | 7            |

Pull request 1 lands alone. After it, the three other lanes run in parallel, each in its own
sibling worktree. The file fences are in section 6 of the spec, with two additions from this plan:
the saved-data lane also owns `bridge/session/editor-session.ts` and `.prettierignore`, and the
performance lane also owns `tests/performance/` and `vitest.config.ts`.

Four files are shared and take a line or two from more than one lane: `package.json`,
`storage/index.ts`, `core/index.ts`, and `ci-coupling.json`. The lane that merges second rebases.

---

## Pull request 1: lint that holds (#683)

Spec section 5.5. It touches about 25 files in every layer, so no other lane is open while it is.

### Cycle 1.1: a change in a source layer selects `tests/`

- [ ] RED in `scripts/ci/select-tests.test.mjs`, using the existing `deps()` helper:
  - `['core/model/types.ts']` gives `paths === 'app/ bridge/ core/ editor/ engine/ storage/ tests/'`.
  - `['editor/plan/plan-view.tsx']` gives `'app/ editor/ tests/'` (the existing case changes).
  - `['scripts/pack/vernacular-pack.mjs']` still gives `'scripts/'`.
  - `['scripts/schema/generate-schema.mjs']`, with `'scripts/schema/': ['core']` added to the test
    coupling, gives every layer, `scripts/`, and `tests/`.
  - `['README.md']` still gives `mode === 'none'`.
- [ ] GREEN: `selectionDirs` in `scripts/ci/select-tests.mjs` adds `tests/` when at least one
      layer is selected. `ci-coupling.json` gains the edge `"scripts/schema/": ["core"]`, because
      the drift tests under `tests/format/` import the schema scripts.
- [ ] Commits: `test: expect a source change to select the tests directory`,
      `ci: run the tests directory on every source change`.

### Cycle 1.2: the 17 warnings that are fixed

No behavior changes, so each is one commit under green tests. Re-run `pnpm exec eslint . -f json`
first and confirm the count is still 43.

- [ ] `refactor: pass the floor pattern options as one object`
      (`core/registries/floor-patterns.ts:24`, the four-parameter arrow function, and its callers).
- [ ] `refactor: pass the furniture box section options as one object`
      (`boxSections` in `engine/scene/furniture-builder.ts:65`, and its callers).
- [ ] `test(e2e): pass the marquee drag options as one object`
      (`marquee` in `e2e/tests/journeys/marquee-multiselect.spec.ts:17`).
- [ ] `chore: split two long describe blocks`
      (`editor/plan/underlay-menu.test.tsx`, `editor/shell/discard-dialog.test.tsx`).
- [ ] `chore: mark the inch-fraction table as data` (`editor/plan/opening-inspector.tsx`: one
      scoped disable with a reason, in the form the registry tables use).
- [ ] `chore: leave the generated mock service worker out of lint`
      (`public/mockServiceWorker.js` joins `ignores` in `eslint.config.js`).
- [ ] Check: `pnpm exec eslint .` now reports 26 warnings, all in the files of the spec's second
      table.

### Cycle 1.3: the three import cycles are broken

- [ ] `refactor: break the import cycle between the room label and the label layout`
      (`editor/plan/room-label.ts` imports `labelBox` from `label-layout.ts`, which imports back).
- [ ] `refactor: break the import cycle between the ruler and its label spacing`
      (`RULER_MIN_LABEL_GAP_PX` moves to the side that both can import).
- [ ] `refactor: break the import cycle between the project actions and the open-file action`
      (what `app/use-open-file-action.ts` takes from `app/use-project-actions.ts` moves to a third
      module).

Each is one moved constant or helper. No public name changes.

### Cycle 1.4: a value-import cycle fails

**Interfaces** (new file `tests/architecture/import-graph.ts`):

```ts
/** Cycles among `sources` (repository-relative path to source text). Value imports only. */
export function findValueImportCycles(sources: ReadonlyMap<string, string>): string[][]
/** Every `.ts` and `.tsx` file under the six layer directories. */
export function readLayerSources(repositoryRoot: string): Map<string, string>
```

- [ ] RED in `tests/architecture/import-cycles.test.ts`:
  - two files that import a value from each other give one cycle that names both;
  - two files that use only `import type` on each other give none;
  - `import { type A }` alone is type-only, and `import { type A, b }` is a value import;
  - `export { x } from` and `export * from` count as value imports, and a dynamic `import()` does
    not;
  - a specifier resolves to `.ts`, `.tsx`, or `/index.ts`;
  - `findValueImportCycles(readLayerSources(root))` is `[]`, and the failure message lists the
    files of each cycle.
- [ ] GREEN: the helper, written with `ts.preProcessFile` or the syntax tree. Strongly connected
      components of size two or more are the cycles.
- [ ] Commits: `test: expect a value-import cycle between layer files to fail`,
      `build: detect value-import cycles from the import graph`.

### Cycle 1.5: the exception list

**Interfaces** (`eslint.config.js`):

```js
/** @typedef {{ file: string, rule: string, issue: number, max?: number }} LintException */
export const lintExceptions = [
  /* 26 entries from the spec's table, values re-measured */
]
export function buildConfig(exceptions = lintExceptions) {
  /* the flat config */
}
export default buildConfig()
```

An entry for a size rule (`max-lines`, `max-lines-per-function`, `complexity`) becomes a per-file
block that keeps the rule's standard options and replaces only the limit. An entry for a rule with
no number turns that rule off for that file.

- [ ] RED in `tests/architecture/lint-exceptions.test.ts`:
  - every entry has a positive `issue`, a `file` that exists, and a `max` exactly when its rule is
    a size rule;
  - under `buildConfig()`, linting each listed file reports nothing for its listed rule;
  - under `buildConfig([])`, linting each listed file does report its listed rule. An entry whose
    file passes is stale, and the failure names it;
  - a sample: with one entry capping `max-params` at 4 for `core/sample.ts`, `lintText` rejects a
    five-parameter function there and accepts a four-parameter one.
- [ ] GREEN: the list and `buildConfig`. Measure each value on the day. Where a file now needs a
      smaller fix than its entry, fix it and drop the entry. Moving a file the other way, from
      fixed to recorded, needs the owner.
- [ ] The single-file block for `scripts/story-coverage/uncovered-components.ts` becomes an entry
      capped at the file's measured length. It names the issue that tracks story coverage. If no
      open issue does, file one first.
- [ ] Commits: `test: expect every lint exception to name an issue and still be needed`,
      `build: record the lint exceptions in one list`.

### Cycle 1.6: warnings fail

- [ ] RED in `tests/architecture/lint-severity.test.ts`: for the sample paths `core/sample.ts`,
      `storage/sample.ts`, `engine/sample.ts`, `bridge/sample.tsx`, `editor/sample.tsx`,
      `app/sample.tsx`, `src/sample.tsx`, `core/sample.test.ts`, `editor/sample.stories.tsx`, and
      `e2e/tests/sample.spec.ts`, `calculateConfigForFile` returns no rule at warning level and
      reports unused disable directives as errors. The `lint` script in `package.json` is
      `eslint . --max-warnings 0`.
- [ ] GREEN: every `warn` in `eslint.config.js` becomes `error` at its configured limit, the
      script changes, and `linterOptions.reportUnusedDisableDirectives` is `'error'`.
- [ ] Check: `pnpm lint` exits 0 and prints no warning.
- [ ] Commits: `test: expect no lint rule at warning level`, `build: fail the build on a lint warning`.

### Cycle 1.7: the purity rules

- [ ] RED in `tests/architecture/purity-rules.test.ts`, in the style of
      `tests/architecture/layer-boundaries.test.ts` (`lintText` with a file path). One rejected
      and one accepted sample for each rule:

  | Sample file         | Rejected                               | Accepted                      |
  | ------------------- | -------------------------------------- | ----------------------------- |
  | `core/sample.ts`    | `react`, `three`, `window`, `document` | a relative import, `Math.max` |
  | `storage/sample.ts` | `react`, `three`                       | `localStorage`                |
  | `engine/sample.ts`  | `react`                                | `three`                       |
  | `bridge/sample.tsx` | `three`                                | `@react-three/fiber`, `react` |
  | `editor/sample.tsx` | `three`, `@react-three/fiber`          | `react`                       |
  | `app/sample.tsx`    | `three`, `@react-three/fiber`          | `react`                       |

- [ ] GREEN: `no-restricted-imports` blocks per layer and `no-restricted-globals` for `core/`.
      React packages are `react`, `react/*`, `react-dom`, `react-dom/*`, and `@react-three/*`.
      Three.js packages are `three` and `three/*`. The browser-only globals are the names in
      `globals.browser` that `globals.node` does not have.
- [ ] `bridge/react/scene-selection.test.ts` and
      `bridge/react/framed-scene-reconciler-reuse.test.ts` take what they import from `three` from
      `engine/testing` instead.
- [ ] If `core/` uses a browser-only name today, even as a type, report the list before changing
      the rule. The spec's claim that no violation exists covers imports, not globals.
- [ ] Commits: `test: expect lint to hold the purity rules of each layer`,
      `build: hold the layer purity rules in lint`.

### Cycle 1.8: the texts that describe lint

- [ ] `.claude/rules.md:81` becomes: "ESLint fails a function above 10. A file on the exception
      list in `eslint.config.js` has its own limit until the issue named there removes it."
      Approval of the spec covers this sentence and no other in that file.
- [ ] Section 9.8 of the design specification describes one failing limit per rule, the exception
      list, the purity rules, and the cycle rule, and cites ADR-0185. Run the `humanizer` skill on
      the new prose.
- [ ] Commit: `docs: describe the lint limits and the exception list`.

The pull request description says "Closes #683".

---

## Pull request 2: small corrections

Spec section 5.7. Documents and one comment. No test cycle.

- [ ] `docs: correct the dispatcher comment about saved history` (`core/commands/dispatcher.ts:10-11`:
      history lasts for the session and is not saved, per ADR-0176).
- [ ] Recount three figures of the umbrella specification, and write the command used for each in
      the pull request description: 687 exports from `core/index.ts`, 309 of them with no user
      outside `core/`, and 74 direct reads of wall end points.
- [ ] `docs: correct the recounted figures of the refactor round` (only if a figure differs;
      sections 5.4 and 5.9 of the umbrella specification, citing ADR-0185).

---

## Pull request 3: commands keep `extensions`, with the table of known keys (#678)

Spec sections 5.4 and 5.1 (design points 1, 3, and 4). The schema is at version 17 and has 36
definitions. Eleven types and the root carry `extensions`: `ProjectMeta`, `Floor`, `Wall`,
`Underlay`, `Opening`, `Dimension`, `Stair`, `EnvironmentScene`, `WeatherConditions`,
`RoomOverride`, and `ProjectPalette`. Four keys hold a map: `roomOverrides`, `paint`,
`ProjectMeta.registryVersions`, and `FurnitureInstance.customizations`. Two definitions are tagged
unions: `UnderlaySource` and `SurfaceTreatment`.

### Cycle 3.1: the table of known keys

**Interfaces** (new `core/model/known-keys.ts`, exported from `core/index.ts`; data in
`core/model/known-keys.json`):

```ts
export type KnownValue =
  | { readonly kind: 'leaf' } // a scalar, an enum, or an array of scalars
  | { readonly kind: 'opaque' } // the schema leaves the value open
  | { readonly kind: 'object'; readonly type: string }
  | { readonly kind: 'union'; readonly types: readonly string[] } // a tagged union
  | { readonly kind: 'array'; readonly item: KnownValue }
  | { readonly kind: 'map'; readonly value: KnownValue } // a collection the model owns

export interface KnownType {
  readonly keys: Readonly<Record<string, KnownValue>>
  readonly optional: readonly string[]
}
export type KnownKeyTable = Readonly<Record<string, KnownType>>

export const KNOWN_ROOT_TYPE = 'Project'
export const KNOWN_KEYS: KnownKeyTable
/** Names of the types whose keys include `extensions`, the root included. */
export function typesWithExtensions(table?: KnownKeyTable): string[]
```

The generator is `buildKnownKeys(schema): KnownKeyTable` in a new
`scripts/schema/build-known-keys.mjs`. A map whose values the schema types becomes `map`. A map
whose values the schema leaves open, and every `Extensions` value, becomes `opaque`.

- [ ] RED in `tests/format/known-keys.test.ts`:
  - `buildKnownKeys(buildProjectSchema())` serializes to the committed JSON file, byte for byte;
  - `KNOWN_KEYS.Project.keys.roomOverrides` is a `map` of `{ kind: 'object', type: 'RoomOverride' }`;
  - `KNOWN_KEYS.Project.keys.paint` is a `map` of a `union`;
  - `KNOWN_KEYS.ProjectMeta.keys.registryVersions` is a `map` of a `leaf`;
  - `KNOWN_KEYS.FurnitureInstance.keys.customizations` and every `extensions` key are `opaque`;
  - `KNOWN_KEYS.ProjectMeta.optional` contains `style`, and `KNOWN_KEYS.Floor.optional` contains
    `periodOverride`;
  - `typesWithExtensions()` returns exactly the eleven names above and `Project`.
- [ ] GREEN: the generator and the reader. `scripts/schema/generate-schema.mjs` writes both files,
      and with `--check` it compares both and names the stale one. `.prettierignore` gains
      `core/model/known-keys.json`.
- [ ] If the schema holds a shape this table cannot express, stop and report it.
- [ ] Commits: `test: expect a table of known keys generated from the schema`,
      `feat: generate the table of known keys from the schema`, then the `refactor:` commit.

### Cycle 3.2: one list of commands

**Interfaces:**

```ts
// core/commands/command-registry.ts
types(): readonly string[] // every registered type, in registration order

// core/commands/handlers/register-all-project-commands.ts, exported from core/index.ts
export function registerAllProjectCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project>
```

- [ ] RED: `types()` returns the registered types in order and none twice
      (`core/commands/command-registry.test.ts`). In a new
      `core/commands/handlers/register-all-project-commands.test.ts`, the full registry has 68
      types, and it has a handler for one command of each of the thirteen handler files.
- [ ] GREEN: the method and the function. `createCommandRegistry` in
      `bridge/session/editor-session.ts` becomes one call to it.
- [ ] Commits: `test: expect one function to register every project command`,
      `feat: register every project command through one function`, then the `refactor:` commit.

### Cycle 3.3: every command keeps `extensions` and unknown keys

Test support, written by the test author: `core/commands/testing/extensions-fixture.ts` (a document
with an `extensions` value and the unknown key `x-unknown-probe` on the root and on at least one
object of each of the eleven types) and `core/commands/testing/command-samples.ts`
(`COMMAND_SAMPLES: Record<string, (project: Project) => unknown>`, the parameters for each command
type, built from ids in the fixture).

- [ ] RED in `core/commands/extensions-survive.test.ts`:
  - for each type in `registerAllProjectCommands(new CommandRegistry()).types()`: dispatch the
    command on a copy of the fixture. Every object that carried `extensions` and still exists
    (matched by type and id, or by path for the root, the meta, and nested objects without an id)
    has a deep-equal `extensions` and the same `x-unknown-probe`;
  - a registered type with no entry in `COMMAND_SAMPLES` fails. A second test proves the check by
    registering `'test.unsampled'` and expecting it to be named;
  - a name from `typesWithExtensions()` with no object in the fixture fails. A second test proves
    the check with a fixture that has no stair.
- [ ] GREEN in `core/commands/handlers/`: `rebuildFloor` and `rebuildMetaStyle`
      (`project-commands.ts:283-302` and `:328-341`) copy by spread and delete the cleared key.
      Every other handler the test names gets the same repair. If more than ten handlers fail,
      report the list before repairing them.
- [ ] Commits: `test: expect every command to keep extensions and unknown keys`,
      `fix: keep extensions and unknown keys in every command`, then the `refactor:` commit.

The pull request description says "Closes #678".

---

## Pull request 4: a cleared field stays cleared (#669)

Spec section 5.1. All in `storage/folder/`, plus tests under `tests/format/`.

**Interfaces** (`storage/folder/preserve-unknown.ts`):

```ts
/** A pure function of the previous value, the next value, the table, and the place in it. */
export function graftWithTable(
  previous: unknown,
  next: unknown,
  position: { table: KnownKeyTable; at: KnownValue },
): unknown
/** Unchanged signature. Calls graftWithTable at the root of KNOWN_KEYS. */
export function preserveUnknown(previous: unknown, project: Project): Project
```

### Cycle 4.1: a known key that is absent stays absent

- [ ] RED in `storage/folder/preserve-unknown.test.ts`, with cases generated from `KNOWN_KEYS`:
  - for every type and every key in its `optional` list: a previous object with the key, grafted
    onto a next object without it, yields no key;
  - for every type: an unknown key on the previous object survives;
  - inside the value of an unknown key, a previous-only nested key is restored, as today;
  - an array item without an `id` is taken from the next document as it is.
- [ ] GREEN: `graftWithTable`, and `preserveUnknown` on top of it.
- [ ] Commits: `test: expect the graft to leave a cleared known key cleared`,
      `fix: restore only the keys the schema does not know on save`, then the `refactor:` commit.

### Cycle 4.2: maps follow the table

- [ ] RED: an entry deleted from `roomOverrides`, from `paint`, or from `registryVersions` stays
      deleted. A previous-only key inside `extensions` or `customizations` is restored. With a
      made-up table that has a typed map under another name, a deleted entry also stays deleted,
      which shows that no list of names is left.
- [ ] GREEN: the `map` and `opaque` cases. `KEYED_COLLECTIONS` is removed.
- [ ] Commits: `test: expect a deleted map entry to stay deleted for every typed map`,
      `fix: read the collection maps from the table of known keys`, then the `refactor:` commit.

### Cycle 4.3: tagged unions

- [ ] RED: an underlay source that changes from a raster to a document does not get its old
      `image` back. A paint entry that changes `kind` does not get the old variant's fields back.
      An unknown key on a union value survives when the variant stays.
- [ ] GREEN: at a `union`, a key that any variant defines is known. The hand-written guard for a
      changed `kind` goes away if the tests pass without it.
- [ ] Commits: `test: expect a key of any union variant to count as known`,
      `fix: treat a key of any union variant as known in the graft`, then the `refactor:` commit.

### Cycle 4.4: the previous file is migrated before the graft

- [ ] RED in `storage/folder/folder-project-store.test.ts`, through the `migrate` and
      `targetVersion` options:
  - a file at an older version with a planted unknown key is loaded through a migration that
    removes a known key, then saved and loaded. The removed key is absent and the unknown key is
    present;
  - when the stored file is already at the target version, `migrate` is not called at save time;
  - a previous file at a newer version than the target, one that fails to migrate, and one that
    parses to `[]`, `null`, or a string each save without a graft and without an error.
- [ ] GREEN: `readPriorDocument` in `folder-project-store.ts` returns the migrated previous
      document, or `undefined` in the three cases above.
- [ ] Commits: `test: expect the save-time graft to read the migrated previous file`,
      `fix: migrate the previous file in memory before the graft`, then the `refactor:` commit.

### Cycle 4.5: the independent checks

These pass when they are written. The spec asks for them because the generated tests cannot catch
a table that is wrong in the same way as the tests (spec section 9).

- [ ] `tests/format/cleared-fields.test.ts`: through `FolderProjectStore` on an `InMemoryDirectory`
      and the real commands, clearing `meta.style`, a floor's `periodOverride`, and a furniture
      piece's `name`, then saving and loading, leaves each one cleared.
- [ ] `tests/format/corpus-preservation.test.ts` gains: every document under
      `tests/fixtures/projects/` loads and saves with no edit to a file equal to
      `serializeProjectJson` of the migrated document.
- [ ] `tests/format/schema-drift.test.ts` gains a case that fails on a stale key table, if cycle
      3.1 did not already put it in `known-keys.test.ts`.
- [ ] Commit: `test: check cleared fields and the corpus through the folder store`.

The pull request description says "Closes #669".

---

## Pull request 5: migration backups outlive autosave (#670)

Spec section 5.2.

### Cycle 5.1: backups have their own directory

- [ ] RED in `storage/folder/folder-project-store.test.ts`:
  - a migrated load writes one file under `.house-backups/` with the original bytes, and none
    under `.house-autosave/`;
  - a second load of the same bytes leaves one file;
  - a migrated load of different bytes at the same version leaves two files;
  - a project migrated under one target version and later under a higher one has two backups;
  - when the backup write rejects, `loadProject` rejects, `migrate` is not called, and
    `vernacular.json` is unchanged.
- [ ] GREEN: the path in `loadProject`. A name that carries the version and a digest of the bytes
      gives all four behaviors with one rule (`crypto.subtle.digest`, as
      `storage/assets/user-source.ts` uses it). The tests assert counts and bytes, not names.
- [ ] Commits: `test: expect a migration backup in its own directory`,
      `fix: write migration backups to their own directory`, then the `refactor:` commit.

### Cycle 5.2: the prune removes only snapshot files

- [ ] RED in `storage/snapshots/snapshot-store.test.ts`: after `prune()`, `session-start.json` and
      every `snapshot-*.json` are gone, and `pre-migration-v3.json` and `notes.txt` in
      `.house-autosave/` are still there.
- [ ] GREEN: `prune()` in `storage/snapshots/snapshot-store.ts`.
- [ ] Commits: `test: expect the snapshot prune to leave files it did not write`,
      `fix: prune only the files the snapshot store wrote`, then the `refactor:` commit.

### Cycle 5.3: the lifetime, end to end

- [ ] A new `tests/storage/migration-backups.test.ts` runs the real `createAutosave`, the real
      `SnapshotStore`, and an `OpfsProjectStore` on an `InMemoryDirectory`, with a corpus document
      below the current version as the stored file:
  - an autosave after the migrated load leaves the backup;
  - `commitProject` and a discard of the recovery snapshots leave it;
  - `OpfsProjectStore.delete` removes it;
  - an archive from `exportProjectBundle` holds no backup.
- [ ] Commit: `test: check the lifetime of a migration backup end to end`. If a case fails, it
      becomes a red, green, blue cycle of its own.

### Cycle 5.4: the texts that describe the folder

- [ ] Sections 2.2 and 7 of the format specification, and sections 3.3, 3.4, and 5.5 of the design
      specification: the folder layout gains `.house-backups/`, `.house-autosave/` holds snapshots
      only, and section 7 says how long a backup lives. Cite ADR-0182. Run the `humanizer` skill.
- [ ] Commit: `docs: describe the migration backup directory`.

The pull request description says "Closes #670".

---

## Pull request 6: a project started after a failed load (#671)

Spec section 5.3. New tests go into `app/app-failed-load.test.tsx`, because `app/app.test.tsx` is
on the exception list.

**Interfaces:**

```ts
// storage/active-project/active-project-id-store.ts, exported from storage/index.ts
export interface ActiveProjectIdStore {
  /** The remembered id, or undefined when nothing valid is remembered. Never rejects. */
  read(): Promise<string | undefined>
  /** Remember the id. Rejects when the write fails. */
  write(id: string): Promise<void>
}
export class InMemoryActiveProjectIdStore implements ActiveProjectIdStore {}
export class LocalStorageActiveProjectIdStore implements ActiveProjectIdStore {}
/** Letters, digits, and hyphens; 1 to 64 characters; starts with a letter or digit. */
export function isValidProjectId(id: string): boolean
/** `project-` and a random UUID, never one of `existing`. */
export function newProjectId(existing: readonly string[]): string

// app/app.tsx, AppProps
activeProjectIds?: ActiveProjectIdStore // default: in memory, nothing remembered
resolveSnapshots?: (projectId: string) => Promise<SnapshotsPort | undefined>
projectId?: string // an override for tests; when set, the port is not read

// app/use-resolved-snapshots.ts
useResolvedSnapshots(injected, resolveSnapshots, projectId)
```

### Cycle 6.1: the port

- [ ] RED in `storage/active-project/active-project-id-store.test.ts`, one contract for both
      implementations: `read()` is `undefined` when nothing was written, and `write` then `read`
      returns the id. For the browser one: a stored `'../x'`, `''`, a 200-character string, and a
      `getItem` that throws all read as `undefined`, and a `setItem` that throws makes `write`
      reject. `isValidProjectId` accepts `'current'` and `'project-<uuid>'`. `newProjectId` never
      returns a member of `existing`.
- [ ] GREEN: the two classes and the two functions.
- [ ] Commits: `test: expect a port that remembers the active project id`,
      `feat: remember the active project id behind a storage port`, then the `refactor:` commit.

### Cycle 6.2: the application opens the remembered id

- [ ] RED: with a remembered id and a store that holds that project, the application opens it.
      With nothing remembered it opens `'current'`. The `projectId` property wins over the port.
      A remembered id that the store no longer has opens a fresh project under that id.
- [ ] GREEN: the active id becomes state in `useProjectBoot` (`app/app.tsx`). The boot reads the
      port before it loads. `src/main.tsx` passes `new LocalStorageActiveProjectIdStore()` and
      `resolveSnapshotStore` itself, and no longer passes `projectId`.
- [ ] Commits: `test: expect the application to open the remembered project`,
      `feat: open the remembered project at start`, then the `refactor:` commit.

### Cycle 6.3: a new project gets its own id

- [ ] RED, with an `OpfsProjectStore` on an `InMemoryDirectory` whose `current/vernacular.json`
      does not load: after "Start a new project", an edit, and an autosave, every file under
      `current/` is byte-identical to before, `store.list()` holds a second id, and the snapshot
      files sit under the new id.
- [ ] GREEN: `startFreshProject` takes `newProjectId(ids from store.list())`. The session,
      `EditorWorkspace`, autosave, and `useResolvedSnapshots` all receive the active id, and the
      snapshot store resolves again when the id changes.
- [ ] Commits: `test: expect a project started after a failed load to leave the failed one untouched`,
      `fix: give a project started after a failed load its own id`, then the `refactor:` commit.

### Cycle 6.4: the remembered id moves after the first save

- [ ] RED: before the first save of the new project, a second boot with the same store and port
      shows the failure dialog. After it, a second boot opens the new project. When the session
      runs on the in-memory fallback of `freshStorage()`, the port is never written. When the
      write of the id rejects, the save still reports `saved`, and the next save writes the id.
- [ ] GREEN: the boot code writes the id after a successful autosave or explicit save, when the
      store is durable and the id is not yet remembered. `app/use-workspace-state.ts` reports the
      save upward.
- [ ] Commits: `test: expect the remembered id to move after the first save`,
      `fix: remember a new project after its first save`, then the `refactor:` commit.

### Cycle 6.5: two tabs, and the dialog text

- [ ] RED: two boots that share one store and one port both start a new project. The two ids
      differ, and no file under `current/` or under the other boot's id changes. The dialog reads:
      "The saved project is kept unchanged. A new project is stored separately."
- [ ] GREEN: the dialog copy in `bootErrorView`, and whatever the two-boot case needs.
- [ ] Commits: `test: expect two new projects to stay apart and the dialog to say what is kept`,
      `fix: state in the failure dialog that the saved project is kept`, then the `refactor:` commit.

### Cycle 6.6: the real browser

- [ ] One Playwright journey: a stored project that cannot load, "Start a new project", an edit,
      a save, then a reload opens the new project and the stored bytes of the old one are
      unchanged. `src/e2e-storage-hook.ts` gains what the journey needs to plant and read the
      stored file.
- [ ] Commit: `test(e2e): cover a new project after a failed load`.

The pull request description says "Closes #671".

---

## Pull request 7: performance count gates (#684)

Spec section 5.6, "The reference project" and "Gated counts". Everything is under
`tests/performance/`, which runs on every source change after pull request 1. No production file
changes, so the commits are `test:` and `docs:`.

**Interfaces** (`tests/performance/reference-project.ts`):

```ts
/** The same document on every call: no randomness, no clock, fixed ids, appVersion '0.0.0'. */
export function createReferenceProject(): Project
/** The six gated edits, each built from ids of the reference project. */
export const REFERENCE_EDITS: readonly { name: string; command: (project: Project) => Command }[]
```

The six edit names are `move-wall-endpoint`, `move-furniture`, `resize-opening`, `paint-surface`,
`set-ceiling-height`, and `rename-project`.

`tests/performance/baseline.json` holds `sizes` (floors, walls, rooms, openings, stairs, furniture,
painted surfaces), `planDrawOperations` (for each floor: `total` and `byMethod`), and
`rebuiltObjects` (for each edit: `floor`, `wallGroup`, `room`, `opening`, `furniture`). Running the
tests with `UPDATE_PERFORMANCE_BASELINE=1` rewrites the file.

- [ ] Cycle 7.1, `reference-project.test.ts`: two calls give equal documents and equal JSON. The
      sizes equal `baseline.sizes`, with 4 floors, 200 furniture instances, and openings plus
      stairs equal to 50. The document passes the schema validator.
- [ ] Cycle 7.2, `plan-draw-counts.test.ts`: for each floor, `drawPlan` on `recordingContext()`
      with options from `buildDrawOptions` (`editor/plan/plan-scene.ts`), a fixed viewport that
      shows the whole floor, and the grid, the rulers, the room labels, and the dimensions on. The
      length of `ops` and its tally by name equal the baseline exactly. If a context method does
      not reach `ops`, report it. Do not count around it.
- [ ] Cycle 7.3, `scene-rebuild-counts.test.ts`: reconcile the reference project with
      `createFramedSceneReconciler`, apply each edit with the real command through an editor
      session, reconcile again, and count the groups that are a different object for the same
      element id, by kind. The counts equal the baseline exactly, and `rename-project` gives zero
      for every kind. If a kind has no id that can be read from the framed scene, stop and report.
      Do not edit `bridge/` or `engine/` in this pull request.
- [ ] Cycle 7.4: `tests/performance/README.md` describes the method. Sections 6.10 and 9.3 of the
      design specification replace their sentences about `engine/profiling/` with a pointer to it,
      citing ADR-0186. Run the `humanizer` skill on both.
- [ ] Commits: `test: add the reference project for performance checks`,
      `test: gate the plan draw operations of the reference project`,
      `test: gate the 3D objects rebuilt by each reference edit`,
      `docs: point the performance budgets at the count gates`.

---

## Pull request 8: the timing report and the first baseline (#684)

Spec section 5.6, "Reported times". The owner decided on 2026-11-14 that the first baseline comes
from the owner's development machine.

**Interfaces:**

```ts
// tests/performance/timing.ts (pure, unit-tested)
export function summarize(samplesMs: readonly number[]): { medianMs: number; p95Ms: number }
export function isSoftwareRenderer(rendererName: string): boolean
export function formatReport(current: TimingRun, baseline: TimingRun | undefined): string

export interface TimingRun {
  commit: string
  takenAt: string
  machine: {
    processor: string
    graphicsAdapter: string
    operatingSystem: string
    browserVersion: string
    renderer: 'webgpu' | 'webgl2'
  }
  samples: number
  warmup: number
  times: Record<'planRedraw' | 'sceneUpdate' | 'renderFrame', { medianMs: number; p95Ms: number }>
}
```

The command is `pnpm perf:report`, which runs `scripts/performance/report-times.mjs`. The script
starts the Vitest project `performance` (browser mode, Chromium, a visible window with the GPU on)
and prints the report. `--write-baseline` rewrites `tests/performance/timing-baseline.json`.
`pnpm test` and CI never run the project.

- [ ] Cycle 8.1, the hosting check, before anything else is built: a browser-mode test that only
      prints the renderer name reports a hardware renderer on the owner's machine. If it cannot,
      the fallback is a script that drives `pnpm preview` with a lazily loaded fixture page, and
      that waits for pull request 6 because it edits `src/main.tsx`. Report which one holds.
- [ ] Cycle 8.2, `tests/performance/timing.test.ts`: `summarize` gives the median and the 95th
      percentile of a known list. `isSoftwareRenderer` is true for names that contain
      `SwiftShader`, `llvmpipe`, or `Software`, and false for a hardware adapter name.
      `formatReport` prints each time, its baseline, the ratio, and the 8 ms budget lines.
- [ ] Cycle 8.3, the three measurements on `createReferenceProject()`: plan redraw during a
      scripted drag whose preview changes every frame, 3D scene update from the command to the
      updated scene, and 3D render of one frame with the GPU work included. The command exits 0
      unless it could not measure. It refuses `--write-baseline` on a software renderer. When
      frames do not advance (a hidden window), it says it could not measure and writes nothing.
- [ ] Cycle 8.4, `tests/performance/timing-baseline.test.ts` (unit project): the committed
      baseline has every field of `TimingRun`, and `isSoftwareRenderer(machine.graphicsAdapter)`
      is false.
- [ ] Cycle 8.5, the first baseline: on the owner's development machine, with the window visible,
      run `pnpm perf:report --write-baseline` at the merge commit of pull request 7 or later, and
      commit the file. Extend `tests/performance/README.md` with how to run the command on `main`
      and on a branch on one machine.
- [ ] Commits: `test:` then `build:` for each tooling cycle, then
      `chore: record the first timing baseline`.

The pull request description says "Closes #684".

---

## After the last pull request

- [ ] Tick the first line of the list in #682.
- [ ] Check the skill notes under `.claude/skills/` for text about `.house-autosave/` and backups,
      and refresh what is stale (spec section 8).
- [ ] File an issue for anything a lane scoped down.
