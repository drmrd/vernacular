# The session layer and document identity

Status: approved by the project owner, 2026-11-15. The owner took the fifteen decisions in section 4.1 on that date. Section 4.2 lists the calls made while this document was written, and the owner approved them with the document.

## 1. Why this document exists

The architecture refactor round (`docs/specs/2026-11-14-architecture-refactor-round.md`, tracked in #682) has a second stage, #685. It gives application logic that needs no React a layer of its own, gives a project an identity, and puts every read and write of a document through one codec. This is the area specification for that stage. It settles five issues.

| Issue | Problem                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| #588  | The application has one project slot. Opening another project overwrites the saved one.                                             |
| #591  | A project started after a storage failure runs in memory, and not every path that ends there says so.                               |
| #631  | Load validation runs only in development builds, against the schema for version 8, and filters out the class of error that matters. |
| #672  | The IndexedDB store does not migrate and does not keep unknown fields, and its assets live in memory.                               |
| #673  | Importing an archive drops the assets inside it.                                                                                    |

The umbrella specification listed this stage with no paired feature. The owner changed that during the brainstorm for this document: the Projects page is part of the stage (section 4.1, decision 3). Without it, two projects could exist in storage and the user would have no way to see the second one.

The first stage (`docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`) is specified and planned. Its code had not landed when this document was written. Every statement about the current code was read from `main` at `c29ec99e`. Where this document builds on a result of the first stage, it names the section of that specification.

## 2. Goals, non-goals, and anti-goals

Goals:

1. The workspace holds many projects. Each has its own id, its own address, and a card on a Projects page. Opening, switching, renaming, exporting, or deleting one project does not change another.
2. A project opened from a folder saves back to that folder.
3. Every store reads and writes a document through one codec, so the stores differ only in where the bytes live.
4. A stored project that breaks the format rules does not open as if nothing were wrong. The user learns why, keeps the stored bytes, and decides what happens next.
5. Assets travel with a document through import and export, and they survive a reload in every durable store.
6. Two tabs cannot write the same document.
7. A session that will not survive the tab says so, on every path that leads to one.
8. A test can open a document, edit it, undo, save, and export without importing React.
9. User settings go through one port.

Non-goals:

- Every tenant that ADR-0175 names for `session/`. This stage moves the editor session, the document handle, the open, save, import, and archive export flows, autosave, dirty tracking, and the settings service. Transactions arrive with the command layer. The selection and view stores, the command registry, key routing, and the tool state machines move with the stages that rework them.
- Typed commands, data inverses, and change sets. Those are the command-layer stage.
- The look of the Projects page. This document fixes what the page shows and what it does. The design language (ADR-0154) fixes how it looks.
- The plan, image, and PDF export flows. They stay where they are until the plan drawing stage replaces the exporters.
- A server, accounts, sharing, or editing by more than one person at a time.
- One project in two windows.
- The later work listed in section 9.

Anti-goals. The four in the umbrella specification apply. Five more are specific to this stage.

- A project that is lost or changed because the user switched projects, deleted a different project, or opened a second tab.
- A check that locks a user out of their data. Every refusal to open comes with a way to export what is stored.
- A repair that removes data without the user choosing it.
- A file deleted from a folder the user picked.
- A decision that rules out one project in two windows, or editing by more than one person. The owner set this condition (section 4.1, decision 11).

## 3. Constraints

- The hard invariants in `.claude/rules.md` apply, and every step lands through a green pull request with the red, green, blue cycle.
- Every document from schema version 8 onward still opens after every step, through every store.
- A user who has a project today finds it after the upgrade with no action on their part. It is stored under the id `'current'`, it opens at start, and it has a card.
- No new runtime dependency. Addresses are handled without a routing library.
- A project's address works on a static host with no rewrite rule. It asks the server for nothing but the application shell, so it works offline wherever the shell is served offline. The service worker does not cache the shell yet (design specification, section 11), and #719 tracks that work.
- `session/` imports no React and no Three.js and uses no DOM global. It reaches browser APIs only through ports in `storage/`.
- Browser storage APIs stay inside `storage/`, and after this stage lint enforces that.
- The refusal to open an invalid document reaches users only together with the dialog that lets them export and repair (section 6).

## 4. Decisions

### 4.1 Taken by the owner on 2026-11-15

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Vernacular manages more than one project, with pages to see the projects and to switch between them.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | At start the application opens the most recent project. A setting for the start behavior comes later.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | The Projects page is part of this stage: list, open, new, rename, delete. Anything more gets its own issue.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | The page is a grid of cards. Each card has a preview image and a few facts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5   | No badges. A state is a line of plain text. A project that did not open shows "This project did not open." where its preview would be.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | The facts on a card are the project name, the time of the last change, the number of floors, and where the project is stored ("In this browser." or "Folder: &lt;name&gt;").                                                                                                                                                                                                                                                                                                                                                                |
| 7   | More facts (buildings, floor area, bedrooms, bathrooms, units) come later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | A state line is a statement. It is never an instruction and never a control. The preview shows one floor, the first in the floor list, with no room labels and no dimensions. It is made at each save and stored with a summary record that is derived from the project and can be rebuilt. A click on a card opens the project. A "..." control holds the card's actions.                                                                                                                                                                  |
| 9   | Switching goes through the Projects page, which is a full page and not a dialog. The menu entry is "Switch projects". The open project stays open while the page shows, and returning to it keeps its undo history. A click on another card switches with no prompt: pending changes are written, the project closes, and the other one opens. If the write fails, the switch stops and the application says so. Each project has its own address. The browser's Back control works, a reload opens the same project, and a card is a link. |
| 10  | Delete asks for confirmation in a dialog that names the project and says the action cannot be undone.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11  | A second tab that asks for a project open in another tab shows the Projects page. That is a fair assumption for now. The plan and the 3D view in separate windows, and editing by more than one person, are later work. Nothing decided in this stage may make either unattainable.                                                                                                                                                                                                                                                         |
| 12  | The card action is named "Export". Every card has it, including the card of a project that did not open. More formats come later for projects that can be read.                                                                                                                                                                                                                                                                                                                                                                             |
| 13  | A stored project that breaks the format rules does not open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 14  | When a project does not open, the user decides what happens. A dialog says that the project did not open and gives the reason, with details that can be expanded. It offers close, export, and, when a known repair exists, opening with the repair applied. The repaired project can open as a new project or replace the stored one. The replace choice carries a plain warning that data can be lost.                                                                                                                                    |
| 15  | A repair that loses no data runs without a question.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### 4.2 Calls made in this document

The owner saw calls 1 to 14 during the brainstorm and raised no objection. Calls 15 to 33 are new in this document. The owner confirmed three of them on 2026-11-15, each in place of a stated alternative: call 19 over a save that is refused, call 29 over a migration that removes the known leftover keys with no question, and call 32 over moving the folder project in this stage. On the same date the owner changed one rule of call 11: a delete holds the project's lock while it runs (section 5.12, rule 1). The pre-merge review added one rule after the approval: a recovery snapshot that fails the check moves to the backups (section 5.7).

| #   | Area         | Call                                                                                                                                                                                            | Section |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Delete       | The dialog text, what a delete removes, and which projects can be deleted. A folder project has "Remove from list" in place of Delete. It removes no file and shows no dialog.                  | 5.8     |
| 2   | Page actions | New project, Import file, and Open folder. An import makes a copy in the workspace and leaves the file alone.                                                                                   | 5.8     |
| 3   | Rename       | Rename is on the card and in the Project menu. A closed project is renamed through the same command the editor uses.                                                                            | 5.8     |
| 4   | Card actions | The order is Rename, Export, Delete. A project that did not open has Export and Delete only.                                                                                                    | 5.8     |
| 5   | Card states  | The lines for a folder that needs permission again and for a project that lives in the tab only.                                                                                                | 5.8     |
| 6   | Start        | "Most recent" means last opened or last saved. An empty workspace starts in an empty project. A new project gets its card at its first save.                                                    | 5.9     |
| 7   | Export       | One format in this stage. Pending changes are written first. A project open in another tab exports its last saved state. A project that did not open exports as an unchecked copy.              | 5.8     |
| 8   | Dialog       | Where the failure dialog shows, its sentences, when "Try again" appears, and the removal of the "Start a new project" control that the first stage builds.                                      | 5.7     |
| 9   | Repair       | A repair runs in memory first and writes nothing. The dialog says what the repair removes. "Open as a new project" is the first choice. A replace keeps a backup.                               | 5.7     |
| 10  | Repair       | Two classes. A repair that removes data is always an offer in the dialog, from a named list. A repair that loses no data is a migration step.                                                   | 5.7     |
| 11  | Later work   | Five guard rails that keep two windows and shared editing possible.                                                                                                                             | 5.12    |
| 12  | Size         | One specification for all of #685. The plan delivers it in several pull requests. The repair list and the dialog stay in this stage.                                                            | 6       |
| 13  | #591         | Every path into temporary storage raises the storage banner. A switch between projects there asks nothing.                                                                                      | 5.10    |
| 14  | Menu         | The entry that reads "Open file" today becomes "Import file", because it makes a copy.                                                                                                          | 5.8     |
| 15  | Identity     | A project index holds one record per project. It replaces the recent-project store and takes over the remembered id of the first stage.                                                         | 5.5     |
| 16  | Identity     | The existing project keeps the id `'current'`. A new project gets a random UUID. The id is not written into the document.                                                                       | 5.5     |
| 17  | Identity     | The preview is a drawing made in `core/`, stored as text, and shown as an image. The record also lists the assets the project uses.                                                             | 5.5     |
| 18  | Codec        | The codec is two pure functions with typed failures. The application bundles one schema, the current one.                                                                                       | 5.2     |
| 19  | Codec        | A failed check never blocks a save. The save is written, the last stored file that passed the check is kept as a backup, and the user is told.                                                  | 5.2     |
| 20  | Codec        | A test runs every registered command and checks that the document still passes the schema.                                                                                                      | 5.2     |
| 21  | Stores       | One conformance suite that every store runs, the IndexedDB store included. A store lists projects without parsing them.                                                                         | 5.3     |
| 22  | Layer        | What moves into `session/` now. `bridge/` and `editor/` reach `storage/` only through `session/`, type-only imports included. Files that have not moved are listed as exceptions.               | 5.1     |
| 23  | Handle       | Closing a handle writes pending changes. The application also writes when the page is hidden. Writes run one at a time.                                                                         | 5.4     |
| 24  | Switch       | The target opens before the current project closes, so a target that fails to open costs nothing.                                                                                               | 5.9     |
| 25  | Addresses    | What an address must do. Its form is left to the builder.                                                                                                                                       | 5.9     |
| 26  | Assets       | The limits on an archive, the hash check on imported assets, and the rule for removing assets when a project is deleted.                                                                        | 5.6     |
| 27  | #591         | In temporary storage the save status never reads as saved.                                                                                                                                      | 5.10    |
| 28  | Settings     | The settings port is its own interface. Snap preferences and the theme choice are its first users.                                                                                              | 5.11    |
| 29  | Repair       | The repair list starts with two entries: the leftover fields of a mixed paint entry (#624), and fields that the format does not define.                                                         | 5.7     |
| 30  | Records      | Five decision records, ADR-0187 to ADR-0191, and the wording of the edits to `CLAUDE.md` and `.claude/rules.md`.                                                                                | 8       |
| 31  | Identity     | The time of the last change is the time of the last save, and the store reports it. A project that does not decode gets its name and its asset list from a best-effort read of the stored file. | 5.5     |
| 32  | Upgrade      | A folder handle that an older build stored under `'current'` is not carried over. The copy in the browser is the newer one, and it gets the card.                                               | 5.5     |
| 33  | Assets       | Projects in the browser share one asset pool. A folder project has its own pool in its folder.                                                                                                  | 5.3     |

## 5. The work

### 5.1 The `session/` layer

Today:

- Lint knows six layers (`eslint.config.js:9-29`). It lets `engine/` import `storage/`, and it lets `editor/` import `storage/` and `engine/`. Nothing in `engine/` imports `storage/`, and nothing in `editor/` imports `engine/`.
- Seven production files in `bridge/` and eleven in `editor/` import `storage/`.
- `bridge/session/` (the editor session, the dirty tracker, the discard guard, and the load helper) and `bridge/autosave/` use no React.
- The open, save, import, and export flows are React hooks in `app/`: `use-project-actions.ts`, `use-open-file-action.ts`, `use-export-actions.ts`, and `use-workspace-state.ts`.

Design:

1. `session/` is created with a barrel, and lint learns it. The import rules are the table in ADR-0175: `session/` may import `core/` and `storage/`. `bridge/` may import `core/`, `session/`, and `engine/`. `editor/` may import `core/`, `session/`, and `bridge/`. `app/` may import every layer. The allowances that nothing uses go at once: `engine/` to `storage/`, and `editor/` to `engine/`.
2. ADR-0175 left one question to this document: whether `bridge/` and `editor/` keep a type-only import from `storage/` once their uses have moved. They do not. A type the upper layers need is exported from `session/`. One path to a type is easier to hold than a rule that tells type imports from value imports.
3. The files in `bridge/` and `editor/` that still import `storage/` after this stage are the asset contexts and the library and furniture code, with their tests and stories. Each goes on the exception list that the first stage creates (section 5.5 there), with the issue that removes it (#717). The layer rule itself is strict from the first day.
4. What moves in this stage: everything in `bridge/session/` and `bridge/autosave/`, and the logic of the flows in `app/`. Each flow becomes a function in `session/` that takes ports and returns a typed result. The hooks in `app/` shrink to adapters that call the function and show the result.
5. The flows report a failure as a typed result. The adapter turns it into a notification. The notification channel that the umbrella specification gives to `session/` is not built here.
6. Lint holds the purity of `session/` the way the first stage holds it for `core/`: no React package, no Three.js package, no browser-only global, with one test per rule.
7. The discard prompt in front of New project, Open file, Open folder, and the recent list goes away. A switch writes pending changes instead of asking whether to throw them away (decision 9). The prompt for a recovered copy stays.

Left to the builder: the layout of `session/`, the names of the flow functions, and which issue each exception names.

Done when:

- Lint rejects an import of React, of Three.js, of `bridge/`, of `editor/`, and of `engine/` from a file in `session/`, and accepts `core/` and `storage/`. Each case is a test under `tests/architecture/`.
- Lint rejects a `storage/` import, type-only or not, from a file in `bridge/` or `editor/` that is not on the exception list.
- No file in `app/` calls a store directly. The flows are the only callers.
- `ARCHITECTURE.md`, `CLAUDE.md`, `.claude/rules.md`, and section 2.1 of the design specification describe seven layers, in the same pull request that creates `session/`.

### 5.2 One document codec

Today:

- Parsing and serializing live in `storage/folder/project-json.ts`. Migration is `migrateProject` in `core/migrations/`, and three places call it: the folder store, the snapshot store, and file import (`storage/import/import-project-file.ts:28`). Nothing checks what a migration returns.
- The IndexedDB store returns the stored object as it is and stores the live object as it is (`storage/indexeddb/indexeddb-project-store.ts:47-64`).
- `core/format/` holds validators and nothing else. The application has one validation call, `app/validate-loaded-project.ts`. It imports the schema for version 8 while the current version is 17 (`core/model/factories.ts:43`). It filters every error about an unknown field, it writes to the console, and it runs only in a development build. Two paths call it: the load at start and Open file.
- Unknown data is kept by the graft in `storage/folder/preserve-unknown.ts`, which only the folder-shaped stores use.
- No code reads or writes `schemaRevision`.

Design:

1. The codec is two pure functions in `core/`. Decode takes the bytes of a stored document and returns a document or a typed failure. Encode takes a document, and the previous stored document when there is one, and returns bytes. Neither does any I/O.
2. Decode parses, reads the version and the revision, refuses a version above its own, migrates up the chain, and validates. It reports whether it migrated and from which version. A migration to a higher version sets the revision back to 0, as ADR-0178 requires.
3. Encode validates, grafts unknown data from the previous document with the table of known keys from the first stage (section 5.1 there), writes `schemaRevision`, and serializes. The table and the graft move into the codec as they are. Within one version, encode never lowers a revision: it writes the higher of the document's revision and the build's. A document that came in at a higher revision is checked on the way out with the same tolerance as on the way in, so its unknown fields are not a fault.
4. Validation is strict and runs in every build, against the schema of the current version and revision. The reading rules are the table in ADR-0178. For a file at the reader's version and at or below its revision, a field the schema does not define, outside `extensions`, is an error. A file at a higher revision is read tolerantly: unknown fields are kept, and the application says that a newer build saved the project. The tolerant reading accepts an unknown field at any depth, inside a variant of a union too. `extensions` is checked as an open object in every case.
5. A decode that fails validation returns a failure with the errors and their paths. The document does not open (decision 13). Section 5.7 says what the user sees.
6. A failed check never blocks a save. A document can only become invalid in memory through a defect in a command, and refusing to write it would turn that defect into lost work. Encode reports the errors and still returns the bytes. The wrapper of section 5.3 keeps the last stored file that passed the check as a backup, by the backup rule of the first stage (ADR-0182), before it writes. The application tells the user once that the project has a fault, that a copy of the last sound state is kept, and that Export is available. The next open of that project fails the check and goes through section 5.7.
7. The defect itself is caught earlier. The first stage adds a test that runs every registered command against a fixture document (section 5.4 there). This stage runs the same commands against a second fixture that carries no planted unknown key, and checks after each command that the document still passes the schema. The fixture of the first stage cannot serve, because its planted keys fail the strict check by design. The mixed paint entry of #624 would have failed the new test.
8. Decode failures are typed, because section 5.7 turns each into a sentence: the bytes are not JSON, the JSON is not a project, the version is newer than the build, a migration failed, or the document breaks the format rules.
9. Every path that reads a document goes through decode: each store, archive import, file import, and the restore of a recovery snapshot. Every path that writes one goes through encode: each store, the snapshot write, and archive export. `app/validate-loaded-project.ts` is deleted.
10. The codec writes `schemaRevision`, and the drift test fails when the generated schema changes and neither number rises (ADR-0178). The schema files that exist stay where they are and count as revision 0 of their versions. Adding `schemaRevision` to the model is itself the first additive change to the current version, so this stage publishes revision 1 of that version. The application bundles the current schema only. A file at a lower revision of the same version is valid against it, because a revision only adds optional fields.

Left to the builder: the names and signatures, the path where a later revision of a schema is published (the existing paths and their `$id` values must not change), and whether the validator is compiled when the application is built or when it runs. The pull request states what the choice adds to the production bundle.

Done when:

- One fixture exists for each schema version from 8 to the current one. Each is valid against the published schema of its own version, and each decodes to a document that passes the current schema.
- A document with an unknown field outside `extensions`, at the current revision, fails to decode, and the failure names the path of the field.
- The same document with a higher `schemaRevision` decodes, keeps the field through an encode, and is reported as saved by a newer build.
- A paint entry that carries the fields of two variants fails to decode.
- A document at a higher `schemaVersion` fails with the reason for a newer version.
- Encode writes the revision. The drift test fails on a schema change with no increment.
- An encode of an invalid document returns bytes and errors, and the store holds a backup of the last valid file afterward.
- After every registered command, a fixture document with no planted unknown key passes the schema.
- Outside the codec, no file calls `migrateProject`, the JSON parse and serialize helpers, or a validator. A test or a lint rule holds this.

### 5.3 Stores and one conformance suite

Today:

- Five classes implement `ProjectStore`: in memory, IndexedDB, the origin private file system, a picked folder, and an archive.
- The IndexedDB store pairs with an in-memory asset cache (`storage/project-storage.ts:40-44`), writes no migration backup, and has no recovery snapshots. Snapshots exist only on the origin private file system (`app/resolve-snapshot-store.ts`).
- `list()` on the origin private file system parses every project file, and one file that is not JSON makes the whole call fail (`storage/opfs/opfs-project-store.ts:44-65`). A summary is an id and a name. Only the end-to-end test hook calls `list()` or `delete()`.
- `delete()` on the picked-folder store removes every file in the folder (`storage/filesystem/file-system-folder-project-store.ts:112-117`).
- The store that Open folder creates is dropped once the project has loaded (`app/use-project-actions.ts:231-233`). Autosave keeps writing to the workspace store under `'current'`. Open file and the recent list end the same way (`app/use-open-file-action.ts:55`, `app/use-project-actions.ts:261`). So every open overwrites the one slot (#588), and a folder project never saves back to its folder.

Design:

1. A store moves bytes: the document, its backups, its recovery snapshots, and its assets. It does not parse, migrate, graft, or validate. One wrapper in `storage/` puts the codec in front of any store, so no store can skip a step.
2. The wrapper writes the migration backup when a decode has migrated and succeeded, before the document reaches the caller. A decode that fails writes nothing. Decode works in memory, so a failed migration cannot touch the stored file, and the backup only has to exist before the first save of the migrated document. This changes the moment at which the first stage writes the backup (section 5.2 there, point 2). Its other backup rules stand, and now they hold for every durable store.
3. One conformance suite runs against every store. It checks that a store:
   - opens a fixture of every schema version from 8 to the current one, and keeps a backup of each one it migrated;
   - keeps unknown data through a save (a field from a higher revision, and an `extensions` payload);
   - leaves a cleared optional field cleared;
   - keeps an asset across a new instance of the store;
   - holds two projects side by side, where a save of one leaves the bytes of the other identical (a store that holds one project, such as a picked folder or an archive, leaves every file it did not write unchanged);
   - deletes one project and nothing else (a store that holds many projects);
   - lists its projects when one of them holds bytes that are not JSON;
   - fails to load a document that breaks the format rules, and still saves one (section 5.2, point 6);
   - leaves a `vernacular.json` at a newer schema version byte for byte as it was through a save, writes the document to the second document file, and reads it back from there;
   - keeps a copy of a stored file that it cannot read before a save replaces it.
4. The IndexedDB store runs the same suite as the others. Records that exist today hold a document as an object, and they still open.
5. `list()` returns the ids that have a document file, without parsing the file. The facts on a card come from the project index (section 5.5). A project with unreadable bytes is listed like any other, so it gets a card. The document file that makes a project is `vernacular.json`. A second document file (point 10) alone does not.
6. A delete removes the project's document, snapshots, and backups, and it leaves no empty directory behind.
7. The picked-folder store never removes a file from the folder, with one exception. It removes a second document file (point 10), which Vernacular wrote under a name that the format reserves, when the user chose so and a backup in the folder holds the same bytes. Its `delete` goes away. Removing a folder project from the list forgets the stored folder handle and the index record (section 5.8).
8. A folder project keeps its store for as long as the document is open, so a save goes to the folder. Its assets are stored in the folder under `assets/`, and its snapshots and backups in the folder's own sidecar directories, as the format specification lays out. When a save finds a newer `vernacular.json`, the second document file goes into the folder beside it (point 10).
9. Projects in the browser share one asset pool, as they do today, and the user's library uses the same pool. A folder project has its own pool in its folder, and that pool holds every asset the document refers to. On a save, an asset that the document uses and the folder lacks is copied in from the shared pool. A read for a folder project looks in the folder first.
10. A save never replaces a `vernacular.json` at a higher schema version than the build (ADR-0214).
    - The save writes the document to the second document file `vernacular.format-<N>.json`, where N is the build's schema version, and grafts onto that file's earlier content. Each save decides this anew from the stored `vernacular.json`. The save report names the second file.
    - A read whose `vernacular.json` is at a higher version decodes the second document file with the highest version that is not above the build's, and the result says which file it read. With no such file the read fails as a newer version, as before. A repair's replace writes the file that the read came from.
    - A read of a `vernacular.json` that decodes also says whether a second document file exists.
    - The time of the last change is the latest one among the project's document files.
    - On the user's choice the store copies `vernacular.json` to the backups and writes the second file's document over it, or it copies the second file to the backups. In both cases it then removes every second document file at or below the build's version.
    - Before a save replaces a stored file that it cannot read (bytes that are not JSON, bytes that are not a project, or a migration that throws), it copies that file to the backups.
    - A higher `schemaRevision` at the same `schemaVersion` is not a newer version. The graft keeps what that file added.

Left to the builder: the byte-level interface. One way to meet points 1 and 4 together is a directory port over IndexedDB, so that the folder-shaped store, the snapshot store, and the directory asset cache serve that backend unchanged. Also: how the suite reaches IndexedDB, which the unit test environment lacks. A browser-mode test project and a development dependency older than the cooldown are both acceptable. A lighter suite for that one store is not.

Done when:

- Every store passes the suite. This closes three of the umbrella's conditions (section 7).
- A project opened from a folder, edited, and saved has the edit in the folder's file, and the workspace store has gained no project. The test runs on the in-memory directory port. The folder picker itself is checked by hand, as it is today.
- After a delete, a listing of the store's root shows nothing under the project's id.
- No method of the picked-folder store removes a file that Vernacular did not write. The one file it removes is a second document file, after the user's choice and after a backup holds its bytes.
- After two saves over a `vernacular.json` at a newer schema version, that file is identical byte for byte on every store, and a read gives the saved document.
- Until the user chooses, a store that counts removals has counted none.
- After a save over a stored file that is not JSON, a backup holds the bytes of that file.

### 5.4 The document handle

Today:

- A session is built from a project and nothing else. The id, the store, and the snapshot store are properties of a React component (`app/app.tsx:320-329`).
- The lock module in `storage/locks/` has a manager over the Web Locks API and a `createProjectLock` function. Only the end-to-end test hook uses the manager, and nothing calls the function. The manager does not check that the API exists.
- Autosave waits 500 ms after a change (`bridge/autosave/create-autosave.ts:7`). When autosave is disposed, a pending write is dropped. Nothing writes when the page is hidden. A prompt before unload is the only guard.
- Nothing puts two writes in order.

Design:

1. A handle is the only way to get a session. Opening one takes a project's id and location, finds the store, takes the lock, loads through the codec, builds the editor session, and arms autosave. Each of those steps can fail, and the failure is typed: the project is open in another tab, it is not in the store, it did not open, the storage did not answer, the folder needs permission, or the folder cannot be reached.
2. The handle holds the id, the location, the store, the lock, the editor session with its undo history, and the save state. It holds no selection, camera, active floor, or tool state.
3. The handle saves, flushes, and closes. A flush writes pending changes now and resolves when they are stored. A close flushes, stops autosave, and releases the lock. When the flush fails, the close fails, the handle stays open, and the caller decides what to do.
4. Writes run one at a time, and the last state wins.
5. After each successful write the handle updates the project's record in the index, with the preview (section 5.5). A failure there does not fail the save.
6. The lock is taken in the open step and released in the close step, through one port in `storage/`. The browser releases it when the tab ends, so a tab that crashed does not leave a project stuck. In a browser with no lock API the port says so, the handle opens the project, and the application cannot tell that a second tab has it.
7. The adapter in `app/` asks the handle to flush when the page is hidden. The prompt before unload stays for a write that is still pending at that moment.
8. Recovery snapshots belong to the handle's id. The prompt that offers to restore unsaved changes works as it does now, for each project.
9. The undo history ends when the handle closes (ADR-0176).
10. A save that wrote the second document file, or an open that read it, raises one notice per handle: "A newer version of Vernacular saved this project's plan file, and this version cannot read it. Your changes are saved in a second plan file. You can choose between the two plan files on the Projects page." While saves go to the second file, the save status reads "Saved in a second plan file". A save that replaced a stored file it could not read raises one notice per handle: "The stored plan file could not be read. A copy of it is kept with the project's backups." Both notices show as warning toasts, and the save status of the second plan file uses the icon of "All changes saved".

Left to the builder: the names, the shape of the save state, and how the handle exposes it to the adapters.

Done when:

- The session constructor is not exported from `session/`. A session comes from a handle.
- A second open of the same id fails with the reason that another tab has it. A unit test uses an in-memory lock port, and an end-to-end test uses two pages.
- An edit followed at once by a close is in the store afterward.
- A close whose write fails leaves the handle open and returns the failure.
- Two saves that overlap leave the last state in the store. The test uses a slow store.
- A test that imports only from `core/`, `storage/`, and `session/` opens a document, edits it, undoes the edit, saves, and exports an archive. This is the umbrella's sixth condition.

### 5.5 Project identity and the project index

Today:

- The application opens the id `'current'` (`app/app.tsx:50`). The first stage makes the id a value that the boot code reads from a small port (section 5.3 there).
- The recent-project store keeps an id, a name, a backend, and a time (`storage/recent/recent-project-store.ts:3-18`). Every record uses the one id, so the list holds one entry at most. A session on IndexedDB records nothing, because the backend type has no member for it (`app/use-project-actions.ts:38-40`).
- Element ids are random UUIDs (`core/model/factories.ts:85`).

Design:

1. A new project gets a random UUID as its id. The id is the key in the store and in the index. It is not written into the document, so one file imported twice makes two projects.
2. The project that exists today keeps the id `'current'`. Giving it a UUID would mean moving its stored files, and a move that stops halfway is a way to lose them. An older build that opened a folder stored the folder's handle under the same id and then saved every edit to the browser, never to the folder. The copy in the browser is therefore the newer one, and it gets the card. The stored handle is not carried over. The folder's files are not touched, and Open folder adds the folder as a project of its own.
3. A project index holds one record per project the workspace knows. A record carries:
   - the id and the location (in this browser, or a folder with the folder's name);
   - what is derived from the document: the name, the number of floors, the preview, and the list of assets the document refers to;
   - what the store reports: the time of the last change, which is the time of the last save;
   - what is neither: the time of the last use (an open or a save), and the result of the last attempt to open, with the build that made it;
   - what the store reports about a second document file: whether one exists, and whether the last open read it.
4. The index is a port in `storage/` with a browser implementation and an in-memory one. It can be read before any project loads, it works beside both durable backends, and it is not a project.
5. The derived part can be rebuilt. A project in the store with no record gets one by decoding the document. A record for a workspace project that the store no longer has is dropped. When the time of the last use is lost, the time of the last change stands in for it. A project that does not decode gets its name and its asset list from a best-effort read of the stored file. When that read gives no name, the card shows a fixed placeholder.
6. A record for a folder project is what lets its card show a preview and facts before the browser has granted access to the folder again.
7. The index replaces the recent-project store. The recent entries in the Project menu are the five records used most recently, apart from the open one.
8. The index also takes over the remembered id of the first stage. The project to open at start is the record with the latest use. The port of the first stage becomes an adapter over the index or goes away.
9. The page reads a project as failed from the result in its record. When the build has changed since a failure, the page checks that project again, so a fixed build does not leave a stale line on a card.
10. The preview is a drawing of the first floor in the floor list with no text. A pure function in `core/` makes it from the document, and it reuses the existing SVG exporter, which today draws every floor with labels (`core/export/svg/svg-plan-exporter.ts:60-83`). The preview is stored as text and shown through an image element, never inserted as markup. The plan drawing stage replaces the function, and stored previews need no migration because each is made again at the next save.

Left to the builder: the browser API behind the index, the record's shape, and whether an unchanged preview is written again.

Done when:

- Two projects exist in the workspace store. Opening and saving one leaves the bytes of the other identical. This is the umbrella's first condition.
- A new project has a UUID. Two imports of one file have different ids.
- A store that holds only `'current'` and no index starts in that project and then has a record for it.
- With the index emptied, the page shows the same name, floor count, and preview for each workspace project as before.
- A project whose bytes are not JSON has a record that says it did not open, and the list call succeeds.
- After a save, the record carries the document's name, floor count, and asset list.
- The preview holds no text element and only the geometry of the first floor.

### 5.6 Assets travel with documents

Today:

- An import reads the document from an archive and discards the rest (`storage/import/import-project-file.ts:24-26`).
- An export skips an asset the cache lacks and reports nothing (`storage/zip/export-project-bundle.ts:59-63`).
- The whole archive is inflated in memory with no limit of any kind (`storage/zip/zip-codec.ts:16-24`).
- Asset bytes for the workspace sit at `assets/<hash>`, shared by every project, with no count of who uses them (`storage/project-storage.ts:19-32`).

Design:

1. An import copies the assets in the archive into the shared asset pool. An asset is addressed by the hash of its bytes, so the import checks each one, and an entry whose bytes do not match its name is not copied.
2. An import reports each asset the document refers to that the archive did not supply. The project still opens.
3. An export reports each asset it could not include. The file is still written. An asset that an installed pack supplies is not a gap.
4. Every durable store has a durable asset cache (section 5.3, point 4 covers IndexedDB).
5. An archive is an untrusted file. The reader refuses one above any of these limits, and it checks the sizes the archive declares before it inflates and the sizes it gets while it inflates.

   | Limit                       | Value  |
   | --------------------------- | ------ |
   | Size of the archive         | 512 MB |
   | Total size after inflation  | 1 GB   |
   | Number of entries           | 10,000 |
   | Size of the document inside | 64 MB  |

   The values sit in one module. They are a first estimate and can change with evidence.

6. The reader writes only the document and the entries under `assets/`. An entry with a path outside the archive layout is ignored.
7. Deleting a project removes an asset only when no other project in the workspace and no entry of the user's library refers to it. The asset lists in the index records answer that. A list that came from a best-effort read of a project that did not open can be incomplete. While the workspace holds another project in that state, a delete removes no asset. A project in the workspace store that has no record counts the same way, because nothing says which assets it uses. So does a project whose record is older than its stored document. A delete writes the pending changes of the open project first, so that its record is current. Assets inside a folder project are never removed.

Left to the builder: which asset scopes an archive must carry, and the wording of the two reports.

Done when:

- A project with a furniture model and an underlay image is exported, then imported into an empty workspace. The document is equal and each asset has the same bytes. This is the umbrella's fourth condition.
- An archive that lacks one referenced asset imports, and the report names one asset.
- An export with one asset absent from the cache writes the file and reports one asset.
- An archive over each limit is refused. One test uses a small archive that declares a small size and inflates to a large one.
- An asset whose bytes do not match its hash is not in the cache after the import.
- A delete removes an asset that only that project used, keeps one that another project uses, and keeps one that the library uses.

### 5.7 A project that does not open

Today:

- Validation never stops a load.
- When the load at start fails, a plain view shows the error, a Retry control, and "Start a new project" (`app/app.tsx:223-236`). The first stage gives that new project its own id and corrects the sentence under the controls.
- The recovery prompt restores unsaved changes of a project that opened (`editor/shell/project-controls.tsx:76-89`). No control opens a recovery copy of a project that did not.

Design:

#### The check

A stored project that fails decode does not open. A failed open writes no file of the project, so the stored bytes are as they were. It writes only the record in the project index, which says why the project did not open.

A recovery snapshot that fails decode is not restored. It moves to the project's backups, where no prune removes it, and a notice says that the copy could not be read and is kept.

#### Two classes of repair

1. A repair that loses no data is a step in the migration chain. It takes the next `schemaVersion`, as the rekeying of room overrides did at version 17. It runs with no question (decision 15), the migration backup protects the original, and its test shows that every value of the input is in the output. This answers the question the first stage left open about how data repairs are numbered.
2. A repair that removes data is never in the chain. It is an entry in a named list in `core/`. An entry recognizes the fault, produces the repaired document, and says what it removes, with a count. The open flow tries the list when validation fails. If the repaired document passes the check, the dialog offers the repair. If it does not, there is no offer.
3. The list starts with two entries. The first is the mixed paint entry of #624: an entry under `paint` has one `kind` and also carries fields that only another variant defines, and the repair removes those fields. The second is general: a field that the format does not define, outside `extensions`, at any place in the document. The repair removes each such field, and the details box lists their paths. It covers a key that an older build wrote back after a migration had removed it, which is the fault the first stage describes in its section 5.1. A fault of any other kind, such as a missing field or a value of the wrong type, has no repair in this stage.

#### The dialog

The dialog shows on the Projects page in three cases: at start when the most recent project did not open, after a click on a card whose project does not open, and after an address that names such a project.

- The title is "This project did not open."
- One sentence gives the reason.

  | Cause                            | Sentence                                                            |
  | -------------------------------- | ------------------------------------------------------------------- |
  | The document fails validation    | "A part of the project breaks the format rules."                    |
  | The version is above the build's | "A newer version of Vernacular made this project."                  |
  | The bytes are not a project      | "The stored file is not a Vernacular project."                      |
  | A migration failed               | "Vernacular could not bring this project up to the current format." |
  | The storage did not answer       | "The storage did not answer."                                       |
  | The folder cannot be reached     | "The folder is not available."                                      |

- Two more sentences follow: "The stored file is kept unchanged." and "You can export a copy from the Projects page."
- A details box, closed at first, holds the technical text: the error, the paths in the document, the format version, and the build.
- The controls are Close and Export. "Try again" shows only when the storage did not answer or the folder was not available. Close returns to the page.
- When a repair applies, the dialog says what it removes, for example "It removes the extra data from 2 paint entries.", and offers to open with the repair. The repair has already run in memory by then, and nothing has been written.
- That offer leads to a choice dialog titled "Open the repaired project". Its first sentence is "A new file stores a repaired version of this project. The stored file stays unchanged." "Open as a new project" comes first and is the primary control. The stored project is not touched, and the new project's name says that it is a repaired copy. "Replace the stored project" carries the warning "The data that the repair removes is lost. You cannot undo this action." A replace keeps a backup of the stored bytes by the backup rule of the first stage before it writes. Cancel returns to the dialog. For a folder project, a new project made from a repair is stored in this browser, and a replace writes into the folder.
- "Start a new project" is not in the dialog. The page has New project. The first stage builds that control and this stage removes it.

#### A project with two document files

A project whose `vernacular.json` is at a newer version opens from its second document file when it has one (section 5.3, point 10). The dialog of this section does not show for it.

A dialog titled "This project has two plan files" offers the choice. It opens from the card action "Choose a plan file". When the build can read both files, it also shows before the project opens, in the three cases in which the failed-open dialog shows.

- While `vernacular.json` is newer, the dialog says: "A newer version of Vernacular saved the plan file vernacular.json. This version cannot read it. The second plan file, &lt;name&gt;, holds the changes that this version saved."
- When the build can read both, it says: "The plan file vernacular.json changed on &lt;time&gt;. The second plan file, &lt;name&gt;, changed on &lt;time&gt;. An older version of Vernacular saved the second plan file." When a time of change cannot be read, the sentence says "at an unknown time" in place of "on &lt;time&gt;".
- "Keep both plan files" is the primary control and changes nothing. Before an open it reads "Open and keep both plan files" and opens `vernacular.json`.
- "Open the second plan file as a new project" stores the second file's document as a new project in this browser, named "&lt;name&gt; (second plan file)". Its sentence is "The new project is stored in this browser. The second plan file moves to the project's backups." The second file moves only after the new project was saved in durable storage.
- "Replace vernacular.json with the second plan file" carries the warning "The plan file vernacular.json moves to the project's backups. No control brings it back. You cannot undo this action."
- "Remove the second plan file" shows only when the build can read both files. Its sentence is "The second plan file moves to the project's backups."
- Cancel shows before an open and returns to the page.
- Where no dialog shows, an open of a project with two readable plan files fails with the message "This project has two plan files. Open it from the Projects page to choose one." Those places are Open folder on the Projects page, and the recent list and Open folder in the project menu of the editor.

Each choice runs under the project's lock, reads both files again, and writes nothing when one of them changed since the dialog showed. A choice that replaces or removes a file copies its bytes to the backups first.

#### A failed import

A failed import shows the same dialog on the Projects page, with the title "This file did not open." It has no "kept unchanged" sentence and no export sentence, and no Export control, because the user still has the file and nothing is stored. When the bytes are not a project, the reason is "The file is not a Vernacular project." Its other reasons are the sentences of the table above. When a repair applies, the choice dialog says "A new file stores a repaired version of this project. The file that you chose stays unchanged." and offers "Open as a new project" and Cancel, with no replace choice. An archive over a limit gets the sentence "The file is larger than Vernacular can open."

Left to the builder: the final wording, which the design language may adjust as long as each sentence stays a statement, and the name given to a repaired copy.

Done when:

- A project with two mixed paint entries does not open. The dialog gives the sentence for the format rules and the line about 2 paint entries.
- Until the user chooses, a store that counts writes has counted none.
- "Open as a new project" leaves the stored bytes identical and adds a second project that passes the check.
- "Replace the stored project" stores the repaired document and leaves a backup that holds the original bytes.
- A document with one field that the format does not define gets the general repair, and the details box lists the path of the field.
- A document that still fails after every entry on the list gets no offer.
- Each cause in the table yields its sentence.
- The dialog has no control that starts a new project.
- The dialog for a failed import has no Export and no replace choice.
- "Open the second plan file as a new project" leaves `vernacular.json` identical and leaves a backup that holds the bytes of the second file.
- "Replace vernacular.json with the second plan file" leaves a backup that holds the bytes of the replaced file, and the folder then holds no second document file.
- A project with a newer `vernacular.json` and a second document file opens, and the editor shows the document of the second file.

### 5.8 The Projects page

Today:

- The Project menu lists New project, Save, Open file, Open folder, the recent projects, and Rename, in that order (`editor/shell/project-menu.tsx:33-64`).
- The Export control in the editor has four targets, and the first is the archive (`editor/shell/export-menu.tsx:24-45`).
- Rename is the command `project/rename` (`core/commands/handlers/project-commands.ts:6`).
- No page lists projects.

Design:

#### The card

| Part        | Content                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Preview     | The drawing of the first floor, or the sentence "This project did not open." |
| Name        | The project name.                                                            |
| Last change | The time of the last change.                                                 |
| Floors      | The number of floors.                                                        |
| Location    | "In this browser.", "Folder: &lt;name&gt;", or "In this tab only."           |
| State       | None, one, or more of the state lines below.                                 |
| Actions     | A "..." control.                                                             |

State lines:

- "Already open in this tab."
- "Already open in another tab."
- "This folder needs permission again."
- "This project has a second plan file."

A state line is text. It cannot take focus and it is not a control.

#### A click on a card

- A card is a link to the project's address, and a click opens the project. Section 5.9 gives the steps of a switch.
- The card of the project open in this tab returns to the editor with the undo history as it was. So does a "Back to &lt;name&gt;" control at the top of the page, which shows while a project is open.
- The card of a project open in another tab tries to open it. If the other tab still has it, the page stays and so does the line. The page reads the lock state again when it becomes visible.
- The card of a project that did not open tries again and shows the dialog of section 5.7 if it fails.
- The card of a folder that needs permission makes the browser ask. A refusal changes nothing.

#### Card actions

The order is Rename, Export, Choose a plan file, Delete.

| Card                                  | Actions                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| A project in this browser             | Rename, Export, Delete                                             |
| A folder project                      | Rename, Export, Remove from list                                   |
| A project open in another tab         | Export                                                             |
| A project that did not open           | Export, Delete                                                     |
| A project with a second document file | Rename, Export, Choose a plan file, and Delete or Remove from list |

#### Rename

The card action and the Project menu entry both dispatch `project/rename`. For a closed project the flow opens a handle with no editor, dispatches the command, saves, and closes.

#### Export

- This stage has one format, the archive, so the action asks nothing. Plan formats join the same control after the plan drawing stage, under the same label.
- For the project open in this tab, pending changes are written first.
- For a project open in another tab, the export holds the last saved state.
- For a project that did not open, the export is an unchecked copy: the stored files as they are, in one archive, with the recovery snapshots and the migration backups. Its assets are the ones the project's record lists (section 5.5, point 5). One notice says "This copy was not checked, because the project did not open." When the record lists no asset, the copy holds none, and the same notice says so.
- An ordinary export still carries no snapshot and no backup, as the first stage requires. The unchecked copy is the one exception, and an import ignores those entries.
- For a project with a second document file, an ordinary export holds the document that an open would read, as `vernacular.json`. An unchecked copy carries every document file.

#### Delete

- The dialog reads: `Delete "<name>"?` and "This removes the project and its recovery copies from this browser. You cannot undo this action." The controls are Cancel and "Delete project". Cancel has the focus when the dialog opens.
- A delete removes everything that only that project uses: the document, the recovery snapshots, the migration backups, the index record with its preview, and the assets that section 5.6 allows.
- The project open in this tab can be deleted. The page stays, and no project is open afterward.
- A project open in another tab cannot be deleted. A project that did not open can.
- A delete takes the project's lock before it removes anything and holds it until it is done, so no tab can open the project while its files and assets go. When another tab holds the lock, the delete is refused and nothing is removed. For the project open in this tab, the handle closes first and the delete then takes the lock.
- A folder project has "Remove from list". It forgets the folder and the record, removes no file, and shows no dialog.

#### Page actions

- New project makes a project with a new id and opens it in the editor. It gets a card at its first save.
- Import file takes an archive or a document file, makes a copy in the workspace with its assets, and opens the copy. The file does not change. A file dropped on the application does the same.
- Open folder shows where the browser offers folder access. It adds the folder to the list, opens the project in it, and saves back to it. A folder that is already on the list opens its existing entry, so one folder never has two ids and two writers. A folder with no project in it is reported and not added.

#### The rest of the page

The Project menu in the editor reads, in order: New project, Switch projects, Import file, Open folder, Save, Rename, then the recent projects.

With no saved project, the page shows the page actions and a sentence that says there are no saved projects.

The page is built from the components of the design system and gets stories and visual baselines like any other surface. Every card can be reached and opened from the keyboard, and the state lines are part of what a screen reader announces for the card.

Left to the builder: the component structure, the empty-state sentence, the time format, and the file name of an unchecked copy.

Done when:

- The page shows one card per project in the index, with the four facts of decision 6.
- A state line has no button role and cannot take focus.
- Each kind of card offers exactly the actions in the table.
- A rename of a closed project changes the name in the stored document and on the card.
- A delete of one project leaves the bytes of every other project identical, and the store, the index, and the asset cache hold nothing that only the deleted project used. Cancel changes nothing.
- "Remove from list" leaves every file in the folder and shows no dialog.
- An unchecked copy holds the stored document byte for byte, with its snapshots and backups, and the notice shows. An ordinary export holds neither.
- An end-to-end journey makes two projects, switches between them, reloads, and goes back.

### 5.9 Start, addresses, and the switch

Today:

- The application has no routing. Three places read query parameters for test and preview seams (`app/app.tsx:65`, `src/main.tsx:24`, `bridge/react/furniture-model-signals.tsx:10`).

Design:

1. The application has two kinds of place: a project, whose address carries its id, and the Projects page. The bare address of the application means start.
2. Start opens the record with the latest use and replaces the bare address with the project's, so Back does not return to a blank step. With no record, start makes an empty project in the editor.
3. A project address opens that project. A reload is the same address, so it opens the same project.
4. When the project at start or at an address cannot open, the application shows the Projects page. If the project did not open, the dialog of section 5.7 shows on it. If another tab has the project, its card says so. If the id is not in this browser, the page says that.
5. A switch runs in `session/` in this order: flush the current project, open the target, close the current project. If the flush fails, the switch stops, both projects are as they were, and the application says that the changes could not be saved. If the target does not open, the current project stays open with its history. If the close of the current project fails after the target has opened, the target closes and the current project stays open.
6. A stuck save does not trap the user. The Projects page shows while the project stays open, so the user can export it, or delete another project to free space.
7. Each switch adds a step to the browser history. Back from one project to another is a switch like any other, so the history of the project that closed has ended.
8. A card is a link, so the browser's own control for a new tab works on it. The page has no control of its own for that.
9. The query parameters that exist keep working.
10. Parsing an address and making one are pure functions with tests. They live in `app/`, and `session/` knows nothing about addresses.

Left to the builder: the form of the address, within the constraints of section 3.

Done when:

- Each case of points 2 to 4 is a test: a latest record, no record, a project that did not open, a project in another tab, and an unknown id.
- After a switch, a reload opens the project that was open.
- An edit made just before a switch is in the store.
- A target that does not open leaves the current project open, and undo still works in it.
- An end-to-end test uses Back and Forward across two projects and the page.

### 5.10 Temporary storage

Today:

- The storage banner is raised when the browser offers neither durable backend (`app/use-degraded-storage-banner.ts`, `storage/storage-capabilities.ts:81-83`).
- When finding the storage fails at start and the user starts a new project, the session gets an in-memory store and no banner (`app/app.tsx:294-314`). The save status then reports saves that reach no disk (#591).

Design:

1. A handle knows whether its store is durable. Raising the banner is tied to opening a handle on a store that is not, and a session comes only from a handle, so no path can miss it. With no project open, the banner follows the workspace, so the empty Projects page of a temporary workspace shows it, and the address of a project there shows it beside the notice "This project is not stored in this browser."
2. When the workspace storage cannot be found, the workspace lives in memory for the life of the tab. Projects made there stay until the tab closes, the page lists them, and each card gives its location as "In this tab only." A switch between them asks nothing, but closing or reloading the tab does: while the open project lives in the tab alone, even after an export, the browser shows its own leave warning.
3. The banner shows on the Projects page as well as in the editor. Its text names the way out: export the project, or open a folder where the browser offers that.
4. In temporary storage the save status never reads as saved. It says that the project is in this tab only.
5. A folder project opened from a temporary workspace is durable, because its files are in the folder. Its index record ends with the tab.

Left to the builder: the banner text and the wording of the save status.

Done when:

- Each way into temporary storage raises the banner: a browser with no durable backend, and a storage lookup that throws.
- The save status of a project in temporary storage does not show the saved state.
- The card of such a project reads "In this tab only."
- In temporary storage, the empty Projects page shows the banner, and so does the address of a project there, beside the notice "This project is not stored in this browser."
- While the open project lives in the tab alone, closing or reloading the tab brings up the browser's leave warning, even after an export.

### 5.11 The settings port

Today:

- One setting is stored. The snap preferences are written to `localStorage` from `editor/plan/snap-preferences-store.ts`, under the key `vernacular.snap-preferences`.
- The theme choice has a control (`editor/shell/theme-toggle.tsx`) and is held in memory (`editor/design-system/theme-provider.tsx:50`), so it is lost on reload.
- `app/opfs-probe.ts` calls a storage API outside `storage/`.
- The library store interface has no settings methods and no implementation (`storage/library-store.ts`).

Design:

1. `storage/` gets a settings port with a browser implementation and an in-memory one. ADR-0180 left open whether the port is part of the library store. It is its own interface, because the library store has nothing to build on.
2. `session/` gets the settings service of ADR-0180: typed keys, defaults, a check of stored values, and change notification. The editor reads it through an adapter in `bridge/`.
3. The service has two users in this stage. The snap preferences move to it, and the old key is read once and carried over. The theme choice is stored through it, which is a change in behavior: the choice now survives a reload. The pull request says so.
4. The design language and unit precision get keys when they get controls.
5. Lint forbids browser storage globals outside `storage/`, and the probe in `app/opfs-probe.ts` moves into `storage/`. The rule covers the source layers and `src/`, with their tests and stories. End-to-end specs are outside it, because a spec checks the browser from inside the page. The storage sentence of rule 1 in `.claude/rules.md` then holds with no exception.
6. Which project to open at start is not a setting. It comes from the project index (section 5.5).
7. A setting that one tab changes reaches the other open tabs at once, with no reload. The port interface has an optional member, `onOutsideChange`, which the browser port implements by listening to the browser's `storage` event and the in-memory port leaves out. The service listens through it and calls the subscribers of the changed setting with the new value. ADR-0180 records this change to the section.

Left to the builder: the browser API behind the port. The theme has to be known before the first paint, which favors an API that can be read synchronously. Also the list of forbidden globals.

Done when:

- Snap preferences stored under the old key are in effect after the upgrade.
- A theme choice is in effect after a reload.
- A theme choice made in one tab shows in another open tab with no reload (`e2e/tests/journeys/settings-follow-another-tab.spec.ts`).
- Lint rejects `localStorage` in a sample file in `editor/` and accepts it in `storage/`. The rule has no entry on the exception list.
- A change to a setting notifies its subscribers.

### 5.12 Guard rails for later work

Decision 11 leaves two things for later and requires that nothing in this stage rules them out. The stage meets that with five rules.

1. Two steps take the lock, both in `session/` and both through one port: the open step of the handle, and the delete of a project, which holds the lock for as long as it runs. Only the project list reads the lock state, through the same port. No editor code depends on it. A later mode in which two windows share a document changes the policy behind that port and nothing else.
2. The handle holds the document, its store, its lock, and its save state. Selection, camera, active floor, and tool state belong to a window and live outside the handle.
3. Every change to a document in a session goes through `dispatch`, the rename of a closed project included. Migrations and repairs are the only code that changes a document without it, and they run before a session exists.
4. A project id is a random UUID. The one id that is not, `'current'`, is local to a browser and would get a new id if projects ever leave the browser.
5. The command-layer specification carries the owner's condition forward when it chooses the form of inverse data and change sets (umbrella specification, section 8).

Editing by more than one person also needs a server, an identity for each person, and a rule for merging changes. This stage decides none of them.

## 6. Order of work

One specification covers the stage, and the plan delivers it in several pull requests. The groups below are cut so that two of them do not own the same file.

| Group             | Work                         | Needs                        | Files it owns                                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codec             | 5.2                          | The first stage              | `core/format/`, the call sites of `core/migrations/`, `storage/folder/project-json.ts`, `storage/folder/preserve-unknown.ts`, `app/validate-loaded-project.ts`, `tests/format/`, `schema/`                                                                                                                            |
| Stores            | 5.3, and point 4 of 5.6      | Codec                        | The store classes in `storage/`, `storage/project-storage.ts`, `storage/snapshots/`, the conformance suite                                                                                                                                                                                                            |
| Session layer     | 5.1, 5.4, and point 5 of 5.9 | Codec, Stores                | `session/`, `bridge/session/`, `bridge/autosave/`, `storage/locks/`, the flow hooks in `app/` (`use-project-actions.ts`, `use-open-file-action.ts`, `use-export-actions.ts`, `use-workspace-state.ts`), `src/e2e-storage-hook.ts`, `eslint.config.js`, `tests/architecture/`, the four documents that list the layers |
| Identity          | 5.5, 5.9                     | Session layer                | `storage/recent/`, `storage/filesystem/directory-handle-store.ts`, the new index port, `src/main.tsx`, the address functions                                                                                                                                                                                          |
| Assets            | 5.6                          | Stores, Session layer        | `storage/zip/`, `storage/import/`                                                                                                                                                                                                                                                                                     |
| Projects page     | 5.8                          | Identity, Assets             | The page components and their stories, `editor/shell/project-menu.tsx`, the end-to-end journeys                                                                                                                                                                                                                       |
| Failed open       | 5.7                          | Codec, Projects page         | The repair list in `core/`, the dialog                                                                                                                                                                                                                                                                                |
| Temporary storage | 5.10                         | Session layer, Projects page | `app/use-degraded-storage-banner.ts`, the save status                                                                                                                                                                                                                                                                 |
| Settings          | 5.11                         | Session layer                | The settings port and service, `editor/plan/snap-preferences-store.ts`, `editor/design-system/theme-provider.tsx`, `app/opfs-probe.ts`                                                                                                                                                                                |

Order inside and between groups:

- The first stage lands before any of this. The codec takes over its table and its graft, the session layer extends its lint exception list, and the identity group replaces its remembered id.
- The codec group builds the strict check, and the application does not act on a failed check yet. The refusal goes live in the failed-open group, in the same pull request as the dialog. Until then a failed check is reported and the document opens, as it does today, on every path that reads one: a store, an import, the restore of a snapshot, and the rebuild of the index. In that interval a document that migrated and then failed the check still gets its migration backup before it opens, so the first save cannot replace the only copy of the original.
- The switch of section 5.9 (point 5) is built with the session layer, because every flow that replaces the open project needs it as soon as the discard prompt goes. The identity group adds start and the addresses.
- After the session layer lands, the identity, assets, and settings groups can run in parallel. The Projects page waits for the assets group as well as for identity, because its Export and Delete use the unchecked copy and the rule for removing assets.
- `storage/index.ts`, `core/index.ts`, `session/index.ts`, and `package.json` are shared. Each change to them is a line or two, and they need a merge order, not an owner.
- `app/app.tsx` has no single owner either. Five groups edit it in turn: the session layer, identity, the Projects page, failed open, and temporary storage. Their dependencies already put them in that order.

A pull request that adds validation or the preview to the save path reports the encode time for the reference project of the first stage (section 5.6 there). Nothing in this stage changes plan drawing or the 3D scene, so the gated counts stay as they are.

## 7. What done means

The umbrella specification lists six conditions for this stage, and #685 repeats them. Each maps to a section here.

| Umbrella condition                                                                                | Closed by |
| ------------------------------------------------------------------------------------------------- | --------- |
| Two projects coexist in the workspace store, and opening one does not change the other.           | 5.5       |
| Where the browser grants folder access, a project opened from a folder saves back to that folder. | 5.3       |
| Every store passes one conformance suite: migrate on load, preserve unknown fields, keep assets.  | 5.3       |
| An archive exported with assets and imported into an empty workspace is identical.                | 5.6       |
| A document at every schema version from 8 to current opens through every store.                   | 5.2, 5.3  |
| A test opens a document, edits it, undoes, saves, and exports with no React import.               | 5.4       |

The issues map as follows.

| Issue | Closed by          |
| ----- | ------------------ |
| #588  | 5.3, 5.5, 5.8, 5.9 |
| #591  | 5.10               |
| #631  | 5.2, 5.7           |
| #672  | 5.2, 5.3, 5.6      |
| #673  | 5.6                |

The stage is done when every "Done when" list in section 5 holds, the five issues and #685 are closed, and the second line of the list in #682 is ticked.

## 8. Changes to other documents

The five decision records land with this document. So do the notes on the older decision records and the changes to the umbrella specification, because they are about the plan. A change to text that describes the code lands with the pull request that makes it true, and cites its record.

| Document                                                                                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Record   |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Umbrella specification, sections 6 and 10; ADR-0104                                         | The second stage has a paired feature, the Projects page. The risk that the first two stages show the user nothing is corrected. ADR-0104 gets a note that the discard prompt in front of a switch goes away.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ADR-0187 |
| Design specification, section 5.3; ADR-0183; ADR-0030                                       | A project has a random id, an address, and a record in the project index. The backend is remembered in that record. ADR-0183 gets a note that the index takes over its port, and ADR-0030 a note that the index replaces the recent-project store.                                                                                                                                                                                                                                                                                                                                                                                                                          | ADR-0188 |
| Umbrella specification, section 8; design specification, section 5.6; ADR-0030              | The open question about a second tab is answered. The second tab shows the Projects page, and the read-only prompt of section 5.6 is replaced. ADR-0030 gets a note that the read-only outcome of its lock has no use.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ADR-0189 |
| Format specification, sections 7 and 8; design specification, section 5.5                   | The application refuses a document that fails validation, keeps the stored bytes, and offers export and repair. The sentence that rules out a hard rejection is replaced. ADR-0178 and ADR-0051 each get a note that points to the new record. The note on ADR-0178 says that the application refuses a file at a newer version and has no read-only mode. ADR-0182 gets a note that the migration backup is written after a successful decode, and the sentences in these sections that put the backup before the migration change with it. Sections 3 and 6.4 of the format specification stand: a refused document is not rewritten, and a repair is the user's own act. | ADR-0190 |
| First-stage specification, sections 5.2 and 5.3; ADR-0183                                   | The migration backup is written after a decode that migrated and succeeded (section 5.2, point 2). The "Start a new project" control is removed from the failure dialog (section 5.3), and ADR-0183 gets a note that says so.                                                                                                                                                                                                                                                                                                                                                                                                                                               | ADR-0190 |
| First-stage specification, section 5.2; ADR-0182                                            | An unchecked copy of a project that did not open carries snapshots and backups. An ordinary export still does not. ADR-0182 gets a note that points to the new record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ADR-0191 |
| Umbrella specification, section 8; ADR-0175                                                 | The open question about a type-only import from `storage/` is answered: `bridge/` and `editor/` keep none. ADR-0175 gets a note that says so.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ADR-0175 |
| Design specification, section 2.1; `ARCHITECTURE.md`                                        | Seven layers, with the import rules of ADR-0175.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ADR-0175 |
| Design specification, section 7.7                                                           | Settings are stored through the settings port. ADR-0180 gets a sentence that records the port as its own interface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ADR-0180 |
| `CLAUDE.md`; `.claude/rules.md`                                                             | The layer list and the invariants that name layers, as worded below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ADR-0175 |
| Format specification, sections 2.2, 2.3, and 7; design specification, section 3.3; ADR-0047 | A folder can hold a second document file beside a newer `vernacular.json`. A writer never replaces a newer file. ADR-0047 gets a note that points to ADR-0214.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ADR-0214 |
| First-stage specification, section 5.1; ADR-0184; ADR-0182                                  | A save with no graft keeps the stored bytes in each of its three cases. ADR-0184 states the cases, and ADR-0182 gets a note on the new backup kinds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ADR-0214 |

Edits to `CLAUDE.md` and `.claude/rules.md` need owner sign-off. Approval of this document gives it for the following text and no more.

- `CLAUDE.md`, repository layout: a line for `session/` between `engine/` and `storage/`, reading "application state and logic. No React. No Three.js." The line for `bridge/` reads "R3F glue and the React adapters over `session/`".
- `CLAUDE.md`, the sentence under the layout: "All seven source layers are live: `core/`, `storage/`, `session/`, `engine/`, `bridge/`, `editor/`, and `app/`".
- `CLAUDE.md`, hard invariants: a new second item, "`session/` imports no React and no Three.js and uses no DOM global."
- `.claude/rules.md`, rule 1: after the sentence about `engine/`, "`session/` imports no React and no Three.js and uses no DOM global." The closing reference becomes "See ADR-0001 and ADR-0175."

The skill notes under `.claude/skills/` describe six layers and one project slot. They are checked after the session layer and the identity group land.

## 9. Later work

Each item has an issue, filed when this document was approved. None of them needs a change to what this stage builds, and the last column says why.

| Item                                                                            | Why it costs no rework                                                                 | Issue |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----- |
| A setting for what the application opens at start                               | A typed key in the settings service, read by the start rule.                           | #706  |
| Duplicate a project                                                             | A new card action over the import flow.                                                | #707  |
| Search and sorting on the Projects page                                         | The index already holds the facts.                                                     | #708  |
| More facts on a card: floor area, bedrooms, bathrooms, then buildings and units | More derived fields in the record. Buildings and units wait for a change to the model. | #709  |
| A "Recently deleted" area that holds a project for 30 days                      | A delete becomes a move. The confirmation dialog stays.                                | #710  |
| Plan formats in the card's Export                                               | The same control under the same label, after the plan drawing stage.                   | #711  |
| One project in two windows, with the plan in one and the 3D view in the other   | Guard rails 1 and 2 in section 5.12.                                                   | #712  |
| Editing by more than one person at a time                                       | Guard rails 1, 3, 4, and 5.                                                            | #713  |
| A control that opens a recovery copy of a project that did not open             | The copies are kept, and the unchecked export already carries them.                    | #714  |
| Move or copy a project between the browser and a folder                         | A flow over two handles.                                                               | #715  |
| A sweep for asset files that no project uses                                    | It reads the asset lists that the index records already carry.                         | #716  |

## 10. Risks

- The strict check will meet real projects. Anyone who switched a surface from a solid color to a pattern before #624 was fixed has a mixed paint entry, and a project that began before version 8 can carry a key that a migration removed. Each such project shows the dialog at the first start after the upgrade, and the two repairs cover both faults. A fault of another kind has no repair, and such a project can only be exported until a build knows the fault. The details box exists so that a report can say what failed.
- The fixtures for versions 8 to 16 are new. An old migration may turn out to produce a document that the current schema rejects. The suite will show it, and each case then needs a lossless repair before the refusal can go live.
- The call on saving an invalid document (section 5.2, point 6) trades one harm for another. The work is kept, and the project then fails to open next time. The alternative, refusing the save, loses the work. The command test in point 7 is what keeps either from happening.
- The Projects page turns a stage with no feature into one with a full surface: a page, three dialogs, addresses, and end-to-end journeys. The stage is larger than the umbrella specification assumed.
- A browser without the lock API gets no protection against a second tab, and the application cannot say so on a card.
- The preview is made at each save. If the encode time for the reference project is high, the builder may write an unchanged preview less often, and the pull request reports the numbers.
- The rule for removing assets keeps an asset whenever it is unsure. Orphaned files can build up until the sweep in section 9 exists.
- A recovery snapshot that fails the check is kept with the backups, but no control reaches it while its project opens: an ordinary export carries no backup. The control that opens a recovery copy (#714) covers this case too.
- The address has to work on a static host and offline. That limits its form, and a wrong choice shows only after a deploy.
- Records in IndexedDB hold objects today. Reading them through a byte-level store is a conversion on a path that has no backup yet, so the original record is kept until the converted one has been read back.
- This document assumes the first stage as specified. If the first stage changes while it is built, sections 5.2, 5.5, and 5.7 change with it.
- `session/` can become the place for everything that fits nowhere else. The placement rule in ADR-0175 is the guard, and this stage moves only what the handle and the flows need.
