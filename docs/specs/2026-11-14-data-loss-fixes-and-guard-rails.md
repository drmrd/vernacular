# Data-loss fixes and guard rails

Status: approved by the project owner, 2026-11-14. The owner took the four decisions in section 4.1 on that date. Section 4.2 lists the calls made while this document was written, and the owner approved them with the document.

## 1. Why this document exists

The architecture refactor round (`docs/specs/2026-11-14-architecture-refactor-round.md`, tracked in #682) opens with a small stage. It fixes the paths that lose saved data without waiting for the structural work, and it puts in place the checks that the later stages depend on. This is the area specification for that stage. It covers six issues.

| Issue | Problem                                                                               |
| ----- | ------------------------------------------------------------------------------------- |
| #669  | A cleared optional field comes back after a save in the folder stores.                |
| #670  | The first autosave after a migrated load deletes the pre-migration backup.            |
| #671  | A project started after a failed load overwrites the project that failed.             |
| #678  | Setting a floor's period or style, or the project style, drops `extensions`.          |
| #683  | Lint warnings do not fail CI, and nothing in lint keeps `core/` free of React or DOM. |
| #684  | Nothing measures the performance budgets in section 6.10 of the design specification. |

The second stage (#685) replaces the code around the four bugs with the session layer, the document handle, and one document codec. Each fix here is cut so that the second stage can take it over as it is. Where a fix could be done in a way that the second stage would have to undo, this document picks the other way and says so.

Every statement about the current code was read from `main` at `615a6f86`.

## 2. Goals, non-goals, and anti-goals

Goals:

1. A cleared optional field stays cleared after a save and a reload.
2. A pre-migration backup outlives autosave and lasts until its project is deleted.
3. A project started after a failed load never writes to the slot of the project that failed.
4. No command drops `extensions`, and a test keeps it that way for every command.
5. A lint warning fails CI. Lint holds the purity rules and rejects import cycles.
6. A later stage can show that it did not make editing slower.

Non-goals:

- The document handle, the codec, and a list of projects in the interface (#588, the second stage). A project that failed to load gets no menu entry here.
- Migration, unknown-field preservation, or backups in the IndexedDB store (#672, the second stage).
- A way to restore a backup from the interface.
- The lint ban on browser storage globals outside `storage/` (ADR-0180, with #685), and an import order inside each layer (left to the later stage specifications).
- Reducing the size of a file that a later stage rewrites.
- Making anything faster. This stage only measures.
- `extensions` on furniture. That arrives with the common attributes of element kinds (#688).
- The numbering of data-repair migrations. That goes into the specification for the second stage.

Anti-goals. The four in the umbrella specification apply. Three more are specific to this stage.

- A performance check that fails CI on a time. Times differ between machines and between runs, and a check that fails at random gets switched off.
- A lint rule switched off, for the whole repository or for a file, to reach zero warnings.
- A fix that the second stage has to undo.

## 3. Constraints

- The hard invariants in `.claude/rules.md` apply, and every step lands through a green pull request with the red, green, blue cycle.
- Every document from schema version 8 onward still opens after every step.
- No new runtime dependency. A new development dependency is allowed if it is older than the 30-day cooldown.
- Browser storage APIs stay inside `storage/`.
- A test that guards the structure of the source has to run on every pull request that changes the source. Section 5.5 explains why that is not true today.

## 4. Decisions

### 4.1 Taken by the owner on 2026-11-14

| #   | Issue | Decision                                                                                                                                                                                                              |
| --- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | #671  | The new project gets its own id. The failed project stays untouched in its slot. The application remembers which id to open at the next start. The failed project has no menu entry until the second stage.           |
| 2   | #670  | Migration backups move to their own directory, out of reach of the autosave prune. A project keeps one backup for each schema version it passed through. A backup is removed only when its project is deleted.        |
| 3   | #683  | Each warning in code that no later stage rewrites is fixed. Every other warning gets a recorded exception that names the issue that removes it. CI fails on each new warning.                                         |
| 4   | #684  | CI gates on counts of work that are the same on every machine: draw operations per plan redraw, and 3D objects rebuilt per edit. One local command reports times against a committed baseline. No time fails a build. |

### 4.2 Calls made in this document

The owner saw the first four during the brainstorm. The rest were new in this document.

| #   | Issue      | Call                                                                                                                                                                                                                  | Section |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | #669       | A table of known keys is generated from the JSON Schema and committed in `core/`. The save-time graft restores a key only when the table does not know it.                                                            | 5.1     |
| 2   | #678       | The two rebuild functions copy by spread. One test runs every registered command against a document that carries `extensions` on every object.                                                                        | 5.4     |
| 3   | #683       | The purity rules are restricted imports and restricted globals, with one test per rule. A rule rejects import cycles. The sentence at `.claude/rules.md:81` is corrected.                                             | 5.5     |
| 4   | (cleanup)  | The stale comment in the dispatcher and a recount of three figures in the umbrella specification are part of this stage.                                                                                              | 5.7     |
| 5   | #669       | The graft runs against the previous file after that file has been migrated in memory.                                                                                                                                 | 5.1     |
| 6   | #678       | The same test also plants one unknown key on every object and checks that it survives.                                                                                                                                | 5.4     |
| 7   | #670       | The directory is `.house-backups/`. A backup is never replaced by different bytes. The snapshot prune removes only the files the snapshot store wrote.                                                                | 5.2     |
| 8   | #671       | The remembered id moves only after the first successful save of the new project to a durable store. It lives behind a small port in `storage/`.                                                                       | 5.3     |
| 9   | #683       | Exceptions sit in one list in `eslint.config.js`. An entry caps a file at its measured value and names an issue. Of the 43 warnings, 17 are fixed and 26 are recorded.                                                | 5.5     |
| 10  | #683       | The cycle rule covers value imports only. The three cycles that exist today are fixed. None gets an exception.                                                                                                        | 5.5     |
| 11  | #683, #684 | The tests under `tests/` run on every pull request that changes a source layer.                                                                                                                                       | 5.5     |
| 12  | #684       | The reference project, the list of gated edits, exact equality as the gate, and the way times are taken.                                                                                                              | 5.6     |
| 13  | (records)  | Five decision records, ADR-0182 to ADR-0186, one per decision that changes a committed document or that the second stage inherits. The design specification is amended in sections 3.3, 3.4, 5.5, 6.10, 9.3, and 9.8. | 8       |

## 5. The work

### 5.1 A cleared field stays cleared (#669)

Today:

- The folder stores keep data they do not understand by grafting the previous file onto the document being saved. `graftObject` (`storage/folder/preserve-unknown.ts:41-56`) restores every key that the previous file has and the next document lacks.
- A command clears an optional field by leaving the key off the object. To the graft that looks the same as a key the reader never knew, so the cleared value comes back on save. A hand-written list exempts two maps, `roomOverrides` and `paint` (`preserve-unknown.ts:9`).
- The JSON Schema generated from `core/model/types.ts` has 36 definitions. All are closed (`additionalProperties: false`) except `Extensions`.
- Save grafts against the file on disk (`storage/folder/folder-project-store.ts:74-81`). After a migrated load that file is still at the old schema version. Two migrations remove a key (`meta.era` in `add-period-and-style.ts:24`, an underlay's `image` in `add-underlay-kind.ts:31`), so the first save after such a load writes the removed key back as if it were unknown data. Both migrations start below version 8 (from 4 and from 6), so today this reaches only documents older than the ones the round promises to open. The next migration that removes or renames a key would bring it to every document, and ADR-0178 reserves `schemaVersion` for exactly those changes.

Design:

1. The schema script generates a table of known keys from the current schema, and the result is committed in `core/`. `pnpm schema:check` fails when the committed table differs from what the schema yields. For each object type the table gives the keys the schema defines and what sits under each key, so the graft can follow the structure of a document. It also says which keys hold a map.
2. When the previous file has a key and the next document does not, the graft restores the key only if the table does not know that key at that place. A known key that is absent was cleared, and it stays cleared.
3. The table also says how to treat a map. A map whose values the schema types (`roomOverrides`, `paint`, `registryVersions`) is a collection the model owns: an entry missing from the next document was deleted. A map whose values the schema leaves open (`extensions`, a furniture piece's `customizations`) is opaque, and the graft treats it as it does today. The hand-written list goes away.
4. A tagged union value is grafted only when its tag is the same in the previous file and in the next document, and then as an object of that one variant. A changed or missing tag means a new value, so nothing of the old one is restored, at that position or below it: its `extensions` and any union value nested in it go with it. An underlay source that changes from a raster to a document therefore does not get its old `image` back. The project owner changed this rule on 2026-11-15. Its first form, in which a key of any variant counted as known, dropped a field from a newer build whenever another variant had a key of the same name.
5. Inside the value of an unknown key the table has nothing to say, and the graft restores as it does today. Array items without an `id` are taken from the next document as they are, also as today.
6. Before the graft, the store migrates the previous file in memory with the same function that load uses. Keys a migration removed are then gone from both sides, and unknown data that the old file carried is still there to restore. If the previous file cannot be parsed or migrated, or is at a newer version than the build, the store saves without a graft, as it does today for a corrupt file. The extra migration runs once, on the first save after a migrated load.

The table is in `core/` and the graft is a pure function of the previous document, the next document, and the table. The codec of the second stage takes both unchanged.

After this fix the graft no longer restores a known key that a command dropped by mistake, and `extensions` is a known key. The fix in section 5.4 therefore lands first. It brings the table generator and the `schema:check` step with it, because its test is the first user of the table. This section then changes the graft.

Left to the builder: the shape and the file name of the table, whether the graft moves into `core/` now or with the codec, and how `schema:check` reports a stale table.

Done when:

- For every optional key of every type in the table, a graft of a previous object that has the key onto a next object that lacks it yields no key. The cases come from the table, so a new optional field is covered without a new test.
- For every object type in the table, an unknown key on the previous object survives the graft.
- Through the folder store and the real commands: clearing `meta.style`, a floor's `periodOverride`, and a furniture piece's `name`, then saving and loading, leaves each one cleared.
- A file at an older version, with an unknown key planted in it, is loaded through a migration that removes a known key, then saved and loaded again. The removed key is absent and the unknown key is present. The test injects the migration through the store's existing `migrate` and `targetVersion` options, because the corpus holds no document older than version 8.
- Deleting an entry of `roomOverrides` or of `paint` still survives a save, and the graft contains no list of collection names.
- Every document in the test corpus under `tests/fixtures/projects/` loads and saves through the folder store, with no edit, to a file that equals the migrated document.
- `pnpm schema:check` fails on a stale table.

### 5.2 Migration backups (#670)

Today:

- On a load at an older schema version the folder store writes the original bytes to `.house-autosave/pre-migration-v<N>.json` before it migrates (`folder-project-store.ts:66-70`).
- The autosave cycle writes a snapshot, saves, then calls `prune()` (`bridge/autosave/create-autosave.ts:53-61`). `prune()` removes every file in `.house-autosave/` (`storage/snapshots/snapshot-store.ts:74-79`). The first autosave after a migrated load deletes the backup.
- Nothing in the application reads a backup. It exists so that a person can recover from a bad migration by hand.

Design:

1. Backups go to `.house-backups/`, beside `vernacular.json`. Like `.house-autosave/`, the directory is not part of the format and never travels in an ordinary archive. There is one named exception: the unchecked copy of a project that did not open carries its migration backups and its recovery snapshots as they are stored (ADR-0191).
2. A backup is written after a decode that migrated and succeeded, before the document reaches the caller. A decode that fails writes nothing. The decode works in memory, so a failed migration leaves the stored file as it was. ADR-0190 changed this point on 2026-11-15. Its first form wrote the backup before the migration ran, as the store did then.
3. A backup write never replaces a file that has different bytes. Loading the same old file twice writes one backup. If the slot later holds a different file at the same old version, both backups stay. This can happen today because every project shares one slot: an older build that cannot read the slot can start a fresh project in it. A content hash in the file name is one way to get this behavior with a single rule.
4. Nothing removes a backup except the deletion of its project. `ProjectStore.delete` already removes the whole project directory.
5. `SnapshotStore.prune()` removes only the files the snapshot store wrote: `session-start.json` and `snapshot-*.json`. This is a second barrier. It also protects a backup that an earlier build left in `.house-autosave/`. Such a backup is left where it is.

The cost the owner accepted: backups are never cleaned up, so a project grows by one document for each schema version it passes through.

Left to the builder: the file naming, and whether the second barrier is a name filter or a list the snapshot store keeps.

Done when:

- An autosave after a migrated load leaves the backup in place. The test runs the real autosave cycle with the real snapshot store and folder store on the in-memory directory.
- An explicit save, and a discard of recovery snapshots, both leave it in place.
- `prune()` leaves a file it did not write in `.house-autosave/`.
- A second migrated load of the same bytes writes no second file. A migrated load of different bytes at the same version keeps both.
- A project that is migrated under one target version and later under a higher one has two backups.
- Deleting the project removes its backups.
- An ordinary archive exported from a project that has a backup contains no backup and no snapshot. The exception is the unchecked copy of a project that did not open, which contains both (ADR-0191).

### 5.3 A project started after a failed load (#671)

Today:

- The application has one project slot with the fixed id `'current'` (`app/app.tsx:50`).
- When the stored project fails to load, the failure dialog offers "Start a new project". `startFreshProject` (`app/app.tsx:294-301`) keeps the store that resolved and creates a fresh session. Autosave is armed with that store and the same id (`app/use-workspace-state.ts:189-208`), so the first edit overwrites the project that failed.
- The dialog says "A new project leaves the saved one where it is until you save over it." The user never chooses to save over it, because autosave does that on the first edit.
- The snapshot store is tied to the same id before the application mounts. `src/main.tsx` passes `resolveSnapshots: () => resolveSnapshotStore(DEFAULT_PROJECT_ID)`, and `app/use-resolved-snapshots.ts` resolves it once. A new id for the session alone would leave the new project's snapshots, and the prune, in the failed project's directory.
- `ProjectStore` already addresses projects by id, and the OPFS store keeps each one in its own directory, so two ids can sit side by side.

Design:

1. The active project id is the id the application opens at start. With nothing remembered it is `'current'`, so an existing user's project opens as before.
2. A new project started from the failure dialog gets a new id that no stored project has. Its session, its autosave, and its snapshots all use the new id. Nothing writes under the id that failed.
3. The remembered id moves after the first successful save of the new project to a durable store. Until then a reload returns to the failure dialog, where Retry is still available. A user who started a new project by mistake, or only to look around, loses nothing by reloading.
4. With no durable store (the store did not resolve and the session runs in memory, the case #591 covers) the remembered id never moves.
5. A small port in `storage/` reads and writes the active project id, with a browser implementation and an in-memory one. `app/` builds it and hands it to the boot code. It has to work with both the OPFS and the IndexedDB backend, it has to be readable before a project loads, and it must not appear as a project in `ProjectStore.list()`. If a write of the id fails, the save still counts, and the application tries again at the next save.
6. The active id is state in the boot code of `app/`. `src/main.tsx` builds the port and passes it in, and it passes the snapshot resolver as a function of the id in place of a resolver bound to `'current'`. The boot code reads the port before it loads a project, and it resolves the snapshot store again when the active id changes. The `projectId` property stays as an override for tests. This threads one id through the properties that exist. It does not build the boot path of the second stage.
7. The dialog states that the saved project is kept unchanged and that the new project is stored separately.

This is the identity model of the second stage in a small form: one id per document, and a record of which one to open. ADR-0175 and ADR-0180 do not say where that record lives. The specification for the second stage decides whether the settings port or the document handle takes this port over. The port is small enough that either move is one adapter.

The cost the owner accepted: once the remembered id has moved, the interface offers no way back to the failed project until the second stage adds a list of projects. Its bytes, its snapshots, and its backups stay in the store.

Left to the builder: the id format, the browser API behind the port, the wording of the dialog, and what the application opens when the remembered id names a project the store no longer has (it must not write under the failed id in any case).

Done when:

- After a failed load and "Start a new project", an edit and an autosave leave the stored bytes of the failed project identical, and the store holds a second project under another id.
- The failed project's `.house-autosave/` and `.house-backups/` are unchanged by that autosave.
- A reload before the first save of the new project shows the failure dialog again.
- A reload after the first save opens the new project.
- With the in-memory fallback, the remembered id does not change.
- The dialog text states that the saved project is kept.

### 5.4 Commands keep `extensions` (#678)

Today:

- `rebuildFloor` and `rebuildMetaStyle` (`core/commands/handlers/project-commands.ts:283-302` and `:328-341`) build their result by listing fields. Neither lists `extensions`, so three commands drop it: set a floor's period, set a floor's style, and set the project style. They drop any unknown key as well.
- The folder stores graft the dropped keys back on save. The IndexedDB store does not. Anything that reads the document in memory before a save, such as export, sees the loss.
- 68 commands are registered across 13 handler files. In the schema, 11 types and the document root carry `extensions`. Furniture does not yet.

Design:

1. Both functions copy the source by spread and remove the key being cleared.
2. One test runs every registered command against a fixture document that has `extensions` on every object the schema gives the field to. After each command, every such object that still exists has its `extensions` unchanged.
3. The fixture also carries one unknown key on each of those objects, and the test checks that it survives too. A rebuild that lists fields drops whatever it does not list, so this catches the pattern whichever fields it happens to name. It also keeps unknown data alive in memory, which the IndexedDB store relies on until the second stage.
4. The test cannot be skipped by accident. It takes the command types from the registry and fails for a registered command that has no sample parameters. It reads the table from section 5.1 and fails when a type that carries `extensions` is missing from the fixture.

The third point may find more handlers that drop data than the two known ones. Each repair is a spread, but the number is unknown until the test runs.

Left to the builder: how the registry exposes its command types, and the layout of the sample parameters.

Done when:

- The test passes for all registered commands, for `extensions` and for the unknown key.
- A registered command without sample parameters fails the test.
- A type with `extensions` in the schema that the fixture lacks fails the test.

### 5.5 Lint that holds (#683)

Today, measured with `pnpm exec eslint . -f json`:

- 43 warnings and no errors. By rule: `max-lines` 12, `max-lines-per-function` 12, `no-magic-numbers` 11, `max-params` 3, `complexity` 2, `react-refresh/only-export-components` 2, and one unused disable directive.
- `eslint.config.js` sets nine rules to `warn`, in eleven places. `pnpm lint` is `eslint .` with no warning limit, so none of them can fail CI.
- Section 9.8 of the design specification describes two limits per size rule, a warning and a higher error. Only the warning limit was ever configured. `.claude/rules.md:81` repeats the two-limit claim for complexity.
- No lint rule stops `core/` from importing React or Three.js, or from using a DOM global. The boundaries rule only covers imports between the repository's own layers. No violation exists today: nothing in `core/`, `storage/`, or `engine/` imports React, no production file outside `engine/` imports `three`, and `@react-three/fiber` is imported only in `bridge/`. Two test files in `bridge/` import `three`.
- Three import cycles run through value imports, each between two files: `editor/plan/room-label.ts` and `label-layout.ts`, `editor/plan/ruler.ts` and `ruler-label-spacing.ts`, `app/use-project-actions.ts` and `use-open-file-action.ts`. Counting type-only imports there are six groups over 27 files.
- On a pull request, `scripts/ci/select-tests.mjs` runs the tests under `tests/` only when a file under `tests/` changed. A pull request that changes only `core/` does not run the architecture test or the format suites. They run after the merge, on `main`. The whole directory takes about three seconds.

Design:

1. Every rule at `warn` moves to `error`, and `pnpm lint` runs with `--max-warnings 0`, so a warning from any other source fails as well. An unused disable directive is an error.
2. Each rule has one limit. The limits that are configured today become the failing limits. The higher limits in section 9.8 of the design specification were never configured and are dropped.
3. Exceptions sit in one list in `eslint.config.js`. An entry names a file, a rule, the issue that removes the entry, and, for a size rule, the file's measured value. Lint fails the file above that value. For a rule with no number the entry turns the rule off for that one file. The list is the only place where a limit is raised or a rule is turned off for a file.
4. The 43 warnings are settled by the owner's third decision in section 4.1, as the tables below show.
5. Lint holds the purity rules with restricted imports and restricted globals:
   - `core/` imports no React package and no Three.js package, and uses no global that exists only in a browser.
   - `storage/` imports no React package and no Three.js package.
   - `engine/` imports no React package.
   - Only `engine/` imports `three`. Only `bridge/` imports `@react-three/*`.
6. An import cycle through value imports among the files of the six layers fails. A cycle of type-only imports has no effect at run time and is allowed. The three cycles that exist are fixed now. Each is two files and one moved constant or helper, which is less work than an exception that would hide new cycles through the same files.
7. The tests under `tests/` run on every pull request that changes a source layer. The count tests of section 5.6 need the same.
8. The 106 inline disable comments that exist stay. Most carry a reason. A new one needs a reason, and review checks that.

The 17 warnings that are fixed:

| File                                             | Warnings | Fix                                                                                                     |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `editor/plan/opening-inspector.tsx`              | 11       | The inch-fraction table is data. It gets a scoped disable with a reason, as the other data tables have. |
| `core/registries/floor-patterns.ts`              | 1        | An options object replaces the fourth parameter.                                                        |
| `engine/scene/furniture-builder.ts`              | 1        | An options object replaces the fourth parameter.                                                        |
| `e2e/tests/journeys/marquee-multiselect.spec.ts` | 1        | An options object replaces the fourth parameter.                                                        |
| `editor/plan/underlay-menu.test.tsx`             | 1        | The one long `describe` block is split.                                                                 |
| `editor/shell/discard-dialog.test.tsx`           | 1        | The one long `describe` block is split.                                                                 |
| `public/mockServiceWorker.js`                    | 1        | The file is generated by a dependency and joins the ignore list.                                        |

The 26 warnings that are recorded, each with the issue that rewrites the code:

| File                                                       | Rule and measured value                                       | Issue |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ----- |
| `app/app.test.tsx`                                         | `max-lines` 434                                               | #685  |
| `app/use-project-actions.test.ts`                          | `max-lines` 411                                               | #685  |
| `bridge/autosave/create-autosave.test.ts`                  | `max-lines-per-function` 223                                  | #685  |
| `core/commands/handlers/furniture-commands.test.ts`        | `max-lines` 335                                               | #686  |
| `core/commands/handlers/opening-commands.test.ts`          | `max-lines` 371, `complexity` 23                              | #686  |
| `core/topology/wall-footprint.test.ts`                     | `max-lines-per-function` 152                                  | #687  |
| `engine/scene/wall-builder.ts`                             | `max-lines` 307                                               | #687  |
| `engine/scene/wall-builder.test.ts`                        | `max-lines` 356                                               | #687  |
| `editor/shell/inspector.tsx`                               | `max-lines` 427, `max-lines-per-function` 87, `complexity` 11 | #688  |
| `editor/plan/hit-test.test.ts`                             | `max-lines` 307                                               | #688  |
| `bridge/react/framed-scene.test.ts`                        | `max-lines-per-function` 283                                  | #689  |
| `bridge/react/scene-nav-toolbar.test.tsx`                  | `max-lines` 378                                               | #689  |
| `bridge/react/scene-selection.tsx`                         | `react-refresh/only-export-components`                        | #689  |
| `engine/scene/near-wall-transparency.test.ts`              | `max-lines` 451, `max-lines-per-function` 155                 | #689  |
| `editor/plan/draw-plan.test.ts`                            | `max-lines-per-function` 168                                  | #690  |
| `editor/plan/draw-underlay.test.ts`                        | `max-lines-per-function` 165                                  | #690  |
| `editor/plan/use-plan-authoring.test.ts`                   | `max-lines-per-function` 201                                  | #691  |
| `editor/shell/editor-shell.test.tsx`                       | `max-lines` 410, `max-lines-per-function` 351                 | #691  |
| `editor/design-system/notifications/use-notifications.tsx` | `react-refresh/only-export-components`                        | #692  |
| `editor/design-system/design-system.stories.tsx`           | `max-lines` 347, `max-lines-per-function` 235                 | #500  |

A test file is recorded under the issue that rewrites the code it tests, because that work rewrites the test too. The plan re-measures the values on the day the list lands. Where a fix turns out to be smaller than its entry, the builder fixes it. Moving a warning the other way needs the owner.

Left to the builder: the mechanism of the cycle rule (a lint plugin, or a test that reads the import graph with the TypeScript compiler, which is already a dependency), provided a cycle fails in `pnpm lint` or in a test that every pull request runs, and the failure names the files. Also: how the list of browser-only globals is derived, and whether the two `bridge/` tests that import `three` are exempted or routed through `engine/testing`.

Done when:

- `pnpm lint` passes on `main` with no warning.
- No rule in the computed configuration of a file in any layer is at warning level, shown by a test.
- Each purity rule has a test under `tests/architecture/` with a sample that the rule rejects and a sample that it accepts.
- A value-import cycle between two files fails, and a type-only cycle passes.
- Every entry in the exception list names an issue. An entry whose file now meets the standard limit fails a test, so the list shrinks as the stages land.
- The test for `select-tests.mjs` shows that a change to a file in any source layer selects `tests/`.

### 5.6 A performance baseline (#684)

Today:

- Section 6.10 of the design specification budgets 8 ms for the scene update and 8 ms for the render, on a project with 4 floors, about 200 furniture instances, about 50 architectural elements, and paint preview on. It names a profiling harness in `engine/profiling/`. That directory does not exist, and no production code measures anything.
- The plan is drawn by `drawPlan` (`editor/plan/draw-plan.ts:183`). Each call clears the canvas and runs up to 20 passes. Nothing skips a pass. Its one caller, `usePlanRedraw` in `editor/plan/plan-scene.ts`, runs it again when any part of the plan scene changes, including the hover and the drag preview.
- The plan tests draw into `recordingContext()` (`editor/plan/draw-plan-test-fixtures.ts`), which logs every context method call.
- The live 3D view is assembled by `createFramedSceneReconciler` (`bridge/react/framed-scene-reconciler.ts`) and `buildFloorBuild` (`bridge/react/floor-build.ts`). They reuse work at four levels: the assembled scene, a floor, the wall group of a floor, and each room, opening, and furniture piece by id. An edit to one wall rebuilds every wall on its floor. A paint edit rebuilds the groups of every floor, because the paint reference belongs to the project. The reconciler reports no counts. It runs in the unit suite with the real Three.js package and no renderer.
- No large project exists as a fixture. The largest harness scene has four walls.
- A spike for the live readout (#502) timed `drawPlan` on one floor of 325 walls with no openings and no furniture, before the wall poche pass existed. Its numbers were not committed.

Design:

#### The reference project

One generator builds the reference project from the `core` factories. It uses no randomness and fixed ids, so it yields the same document on every run. The project meets section 6.10: 4 floors, 200 furniture instances, 50 architectural elements, and paint assigned to surfaces. "Architectural elements" is read as openings and stairs. Section 6.10 gives no wall or room count, so the generator picks them, and the baseline file records every size. Furniture is drawn as massing boxes, so a measurement needs no asset download. Stairs count in the plan only, because they have no 3D builder yet (#169). The plan count test, the 3D count test, and the timing command all import this one generator.

#### Gated counts

Two tests in the unit suite compare counts against numbers in a committed baseline file. The comparison is exact equality.

1. Plan draw operations per redraw: the number of context method calls in one redraw of each floor of the reference project, in total and by method. The viewport is fixed and shows the whole floor, with the grid, the rulers, the room labels, and the dimensions on.
2. 3D objects rebuilt per edit: the number of 3D groups that are a different object after an edit, by kind (floor, wall group, room, opening, furniture). Each edit in a fixed list is made with the real command on the reference project. The list is: move one wall end point, move one furniture piece, resize one opening, paint one surface, change one floor's ceiling height, and rename the project. Renaming the project must rebuild nothing.

A pull request that changes a count updates the baseline in the same pull request and says why in its description. That applies to a lower count as much as a higher one. A lower count is a change in behavior too, and the new number has to be recorded or the next regression hides behind the old one.

The counts are defined by what can be observed (calls on the drawing context, the identity of a 3D group for an element id) and not by function names. When a later stage replaces `drawPlan` or the reconciler, the tests move with the code and the definitions stay. A stage that has to change a definition says so in its specification.

#### Reported times

One local command measures three times on the reference project in a real browser, with a real canvas and a real renderer:

- plan redraw time, during a scripted drag in which the preview changes on every frame;
- 3D scene update time for one edit, from the command to the updated scene;
- 3D render time for one frame, taken so that GPU work is included.

The first baseline is taken on the owner's development machine, which has a hardware GPU. The command names the renderer it ran on and refuses to write a baseline from a software renderer, because no later run on real hardware could be compared with it.

For each time the command prints the median and the 95th percentile after a warm-up, beside the committed baseline and the ratio between them. It prints the 8 ms budgets as reference lines. It describes the machine for both sets of numbers: processor, graphics adapter, operating system, browser version, and whether the renderer ran on WebGPU or WebGL 2. It exits with success unless it could not measure. A flag rewrites the baseline.

The command is not part of `pnpm test` and no CI job runs it.

#### How a later stage uses the baseline

A stage specification cites the baseline. A pull request that changes plan drawing, scene derivation, the reconciler, or rendering runs the command on `main` and on its branch, on one machine, and puts both tables in its description. Times from different machines are not compared.

Sections 6.10 and 9.3 of the design specification each name a harness in `engine/profiling/`. Both sentences are replaced by a pointer to this mechanism. A harness in `engine/` could not measure the plan, which is drawn in `editor/`.

Left to the builder: the wall and room layout of the reference project, the paths of the generator, the baseline file, and the method note, how the browser measurement is hosted (a lazily loaded fixture page, or a browser-mode test project that only the command runs), the number of samples, and how render time includes GPU work. Whatever hosts the measurement stays out of the production entry.

Done when:

- A test fails when a plan draw-operation count for the reference project differs from the baseline.
- A test fails when a rebuilt-object count for a listed edit differs from the baseline.
- Renaming the project rebuilds nothing.
- Both tests run on a pull request that changes any source layer.
- Two runs of the generator yield equal documents, and the document has the sizes that the baseline records and that section 6.10 requires.
- One command prints the three times beside the baseline. The baseline file is committed with the machine description and the commit it was taken at, and a test checks that those fields are present.
- A short note beside the baseline describes the method.

### 5.7 Small corrections

- The comment at `core/commands/dispatcher.ts:10-11` says history is saved with the project. ADR-0176 says it lasts for the session and is not saved. The comment is corrected.
- `.claude/rules.md:81` reads "ESLint enforces this with a warning at 10 and an error at 15." It becomes: "ESLint fails a function above 10. A file on the exception list in `eslint.config.js` has its own limit until the issue named there removes it." Edits to that file need owner sign-off, and approval of this document gives it for this sentence.
- Three figures in the umbrella specification get a recount with the method written in the pull request: 687 exports from `core/index.ts`, 309 of them with no user outside `core/`, and 74 direct reads of wall end points. A figure that differs is corrected there. The fourth figure, 43 lint warnings, was confirmed for this document.

These three items are housekeeping. They are the only work in this stage that is not closed by a test or a lint rule.

## 6. Order of work

Four lanes can run in parallel. Each owns the files listed, so two lanes do not edit the same file.

| Lane        | Work, in order                                          | Files it owns                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint        | #683, then section 5.7                                  | `eslint.config.js`, `tests/architecture/`, `scripts/ci/select-tests.mjs` and its test, `.claude/rules.md`, the files in the "fixed" table, the six files of the three cycles                                                     |
| Saved data  | #678 with the table of known keys, then #669, then #670 | `core/commands/handlers/`, `core/commands/command-registry.ts`, `storage/folder/`, `storage/snapshots/`, `scripts/schema/`, the new table in `core/`, the format specification                                                   |
| Failed load | #671                                                    | `app/app.tsx`, `app/use-workspace-state.ts`, `app/resolve-snapshot-store.ts`, `app/use-resolved-snapshots.ts`, `src/main.tsx`, `src/e2e-storage-hook.ts`, `bridge/session/load-or-create-project.ts`, the new port in `storage/` |
| Performance | #684                                                    | The reference project generator, the count tests, the baseline file, the timing command, section 6.10 of the design specification                                                                                                |

Order inside and between lanes:

- The lint lane lands first. Every later pull request of the round is then held to zero warnings from its first commit, and the change to test selection is in place before the tests that need it arrive.
- In the saved-data lane, #678 lands before #669 for the reason given in section 5.1. #669 and #670 both edit `storage/folder/folder-project-store.ts`, so they run one after the other.
- Three files are shared and need a merge order, not an owner: `package.json` (the lint script and the timing command), `storage/index.ts` (the saved-data and failed-load lanes both add an export), and `core/index.ts` (the table). Each change to them is a line or two.

Every pull request of the round keeps every document from schema version 8 onward loading. The format suites under `tests/format/` check that, and after the lint lane they run on every pull request that touches a source layer.

## 7. What done means

The umbrella specification lists five conditions for this stage. Each maps to a section here.

| Umbrella condition                                                               | Closed by |
| -------------------------------------------------------------------------------- | --------- |
| Clearing any optional field, saving, and reloading leaves the field cleared.     | 5.1       |
| An autosave after a migrated load leaves the pre-migration backup in place.      | 5.2       |
| A project started after a failed load never writes to the failed project's slot. | 5.3       |
| A command that rebuilds a floor or the project meta keeps `extensions`.          | 5.4       |
| CI fails on a lint warning.                                                      | 5.5       |

The stage is done when every "Done when" list in section 5 holds, the six issues are closed, and the first line of the list in #682 is ticked. The performance baseline has no condition in the umbrella's section 7. Its conditions are in section 5.6.

## 8. Changes to other documents

The five decision records land with this document. A change to text that describes the code lands with the pull request that makes it true, and cites its record.

| Document                                                                                   | Change                                                                                                                                                                                                                                                                                    | Record   |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Format specification, sections 2.2 and 7; design specification, sections 3.3, 3.4, and 5.5 | The folder layout gains `.house-backups/`. `.house-autosave/` holds snapshots only. Each mention of the backup path names the new directory, and section 7 of the format specification says how long a backup lives. ADR-0029 and ADR-0119 each get a note that points to the new record. | ADR-0182 |
| (none)                                                                                     | A project started after a failed load gets its own id, and the application remembers the active id.                                                                                                                                                                                       | ADR-0183 |
| (none)                                                                                     | The save-time graft reads a table of known keys generated from the schema, and runs against the migrated previous file. ADR-0051 gets a note that points to the new record.                                                                                                               | ADR-0184 |
| Design specification, section 9.8; `.claude/rules.md:81`                                   | One failing limit per rule, a list of recorded exceptions, the purity rules, and the cycle rule. ADR-0012 gets a note that points to the new record.                                                                                                                                      | ADR-0185 |
| Design specification, sections 6.10 and 9.3                                                | The two sentences about `engine/profiling/` are replaced by the gated counts and the reported times.                                                                                                                                                                                      | ADR-0186 |
| Umbrella specification, sections 5.4 and 5.9                                               | A recounted figure, if one differs.                                                                                                                                                                                                                                                       | ADR-0185 |

The skill notes under `.claude/skills/` describe `.house-autosave/`. They are checked after the saved-data lane lands, and refreshed where they speak of backups.

## 9. Risks

- The test in section 5.4 may find more commands that drop data than the two known functions. The repairs are small, but the count is unknown, so the saved-data lane may take longer than its three issues suggest.
- A wrong entry in the table of known keys loses data in one of two ways: a real unknown key is dropped, or a cleared field comes back. The tests in section 5.1 are generated from the table itself, so they cannot catch a table that is wrong in the same way as the tests. The corpus round trip and the three end-to-end cases are the independent check.
- Once the remembered id has moved, the failed project is out of reach in the interface until the second stage. The owner accepted this. If the second stage slips, a user in that state waits longer.
- Backups never expire. The owner accepted the growth.
- Exact equality on the counts means a pull request that changes drawing on purpose has one more file to update. In return the gate does not fail at random.
- The reported times are only as good as the discipline of running the command on `main` and on the branch on one machine. Nothing enforces it.
- The lint lane touches about 25 files across every layer. It should land when few other lanes are open.
