# Vernacular File Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the on-disk project Document from `project.json` to `vernacular.json` and the shareable export archive from `.house.zip` to `.building`, as a clean pre-1.0 break with no compatibility shim, so readers target only the new names.

**Architecture:** The storage layer already funnels both names through two single-source constants: `PROJECT_FILE` in `storage/folder/folder-project-store.ts` (consumed by the OPFS and zip-bundle stores by import) and `BUNDLE_SUFFIX` in `storage/zip/bundle-filename.ts`. Changing those two values performs the rename; the rest of the work is updating the tests that pin the literals and the doc comments that name the old files. The deprecation is recorded through a Conventional-Commit `BREAKING CHANGE:` footer, which `release-please` renders into the next release's notes.

**Tech Stack:** TypeScript, pnpm (exact pins, 30-day cooldown), Vitest, Playwright (end-to-end), `release-please` (changelog).

**Spec:** `docs/specs/2026-06-10-vernacular-floor-plan-format.md` sections 2.1, 2.3, and 2.4. Design specification sections 3.3 and 3.4. **Decision:** ADR-0047 (the rename is already sequenced there for the implementation plan).

---

## Scope and decomposition

This is plan 2 of the decomposed Vernacular Floor Plan Format set. Plan 1 (the published schema, the `core/format` validator, the drift guard, and the `*.vernacular.json` fixtures) is already complete on the branch this stacks on. Plan 3 (preservation round-trip, validate-after-migration, the Strict profile) and plan 4 (fixture corpus) remain deferred.

**In scope:** the on-disk Document filename, the export archive extension, every test and doc comment that names the old files, and the release-notes deprecation.

**Explicitly out of scope, with reasons (do NOT edit these):**

- **`.house-autosave/` keeps its name.** The format spec (section 2.2) lists `.house-autosave/` in the Folder layout and marks it "not part of the format." It is the autosave sidecar, not the renamed artifact. Leave `AUTOSAVE_DIR`, the snapshot store, and every `.house-autosave` reference untouched.
- **No MIME type or file-picker filter to change.** `downloadBytes(bytes, filename)` is a generic blob download by filename; there is no archive MIME constant and no `accept=` filter for the bundle anywhere in `app/`, `editor/`, or `bridge/`.
- **The design specification (`docs/specs/2026-06-01-vernacular-design.md`) and `ROADMAP.md` are NOT edited.** ADR-0047 records that the design specification is "formalized and extended by" the newer format spec, so its `project.json`/`.house.zip` prose is historical record. Editing the design spec would also trip the CLAUDE.md rule that design-spec changes require a corresponding ADR. ROADMAP entries describe completed slices at the time they shipped and stay as history.
- **The ADRs under `docs/knowledge/decisions/` are NOT edited.** They are durable design history.
- **`CHANGELOG.md` is NOT hand-edited.** It is maintained by `release-please` from Conventional Commits. The deprecation is carried by the `BREAKING CHANGE:` footer on each rename `feat!` commit, which `release-please` surfaces in the next release.
- **Codec module and function names stay** (`PROJECT_FILE`, `parseProjectJson`, `serializeProjectJson`, `readProjectName`, the `project-json.ts` filename). They name the `Project` domain object and "the file that holds the project," both still accurate. Only the on-disk string value changes. Renaming them would balloon the change for no semantic gain.

---

## Before you start (integration coordination)

- **Branch.** This plan is built on `feat/vernacular-file-rename`, stacked on the Plan 1 tip (`docs/vernacular-floor-plan-format`, the floor-plan-format schema work). The base is rebased onto `origin/main` at `CURRENT_SCHEMA_VERSION = 8`. The branch already exists; do not recreate it.
- **Local only.** The push and PR hold is active: commit on the branch, do not push or open a pull request.
- **Run the cycle from the main (this) thread.** The role-separated red-green-blue subagents (`test-author`, `implementer`, `refactorer`) can only be dispatched from the main thread, so orchestrate each task here. Give each subagent the exact allowed files for its step and tell it to STOP rather than touch anything else. Each cycle is test, then feat, then refactor; close every green with a (possibly empty) refactor marker before the next test.
- **Audit discipline.** `pnpm rgb:audit origin/main..HEAD` must stay clean: every cycle is `test:` then `feat:` then `refactor:`. `feat!:` is still type `feat`. The `test(e2e):` type, `docs:`, and `build:` commits are exempt.
- **Do not touch shared config** (`eslint.config.js`, `tsconfig*.json`, `.npmrc`, `package.json`) or `core/migrations/`. This rename needs none of them.
- **ESLint is zero-warnings.** The edits here are value swaps and comment edits, so the usual `max-lines`/`no-magic-numbers` snags should not appear; if one does, do not weaken the config.

---

## File structure

Production code (two value changes, plus comment refreshes):

- `storage/folder/folder-project-store.ts` (modify): `PROJECT_FILE` value, one doc comment.
- `storage/zip/bundle-filename.ts` (modify): `BUNDLE_SUFFIX` value, doc comments.
- `storage/folder/project-json.ts` (modify): doc comments only.
- `storage/opfs/opfs-project-store.ts` (modify): one doc comment only.
- `storage/zip/zip-bundle-project-store.ts` (modify): one doc comment only.
- `storage/zip/zip-codec.ts` (modify): two doc comments only.
- `storage/fs/directory-port.ts` (modify): one doc-comment example only.
- `storage/fs/subdirectory-port.ts` (modify): one doc-comment example only.
- `app/app.tsx` (modify): one code comment only.

Tests and fixtures:

- `storage/folder/folder-project-store.test.ts` (modify): seed paths plus a new explicit filename assertion.
- `storage/opfs/opfs-project-store.test.ts` (modify): seed path, assertion, and two titles.
- `storage/zip/zip-codec.test.ts` (modify): one sample entry key.
- `storage/zip/bundle-filename.test.ts` (modify): four expectations.
- `storage/fs/directory-contract.ts` (modify): decouple the generic byte-store sample keys from the old domain filename.
- `e2e/tests/export-bundle.spec.ts` (modify): expected filename, title, comments.
- `tests/fixtures/projects/README.md` (modify, in Task 3): describe the fixtures as `*.vernacular.json`.

---

## Task 1: Rename the project Document file to `vernacular.json`

The `FolderProjectStore` reads and writes the canonical Document through `PROJECT_FILE`. The OPFS and zip-bundle stores import that same constant, so changing its value renames the file everywhere at once.

**Files:**

- Test: `storage/folder/folder-project-store.test.ts`, `storage/opfs/opfs-project-store.test.ts`, `storage/zip/zip-codec.test.ts`, `storage/fs/directory-contract.ts`
- Modify: `storage/folder/folder-project-store.ts`
- Refactor comments: `storage/folder/project-json.ts`, `storage/opfs/opfs-project-store.ts`, `storage/zip/zip-bundle-project-store.ts`, `storage/fs/directory-port.ts`, `storage/fs/subdirectory-port.ts`, `app/app.tsx`

### RED (test-author)

- [ ] **Step 1: Point the seed paths at the new filename and assert it explicitly**

In `storage/folder/folder-project-store.test.ts`, change the three migration-backup seed writes from `'project.json'` to `'vernacular.json'` (currently lines 107, 121, 131, 137 use `directory.writeFile('project.json', ...)` and one `directory.readFile('project.json')`). Replace every `'project.json'` literal in that file with `'vernacular.json'`.

Then add this test to the `describe('FolderProjectStore', ...)` block, which pins the canonical filename directly:

```ts
it('writes the canonical Document to vernacular.json', async () => {
  const directory = new InMemoryDirectory()
  const store = new FolderProjectStore(directory)

  await store.saveProject(sampleProject())

  expect(await directory.readFile('vernacular.json')).toBeDefined()
  expect(await directory.readFile('project.json')).toBeUndefined()
})
```

- [ ] **Step 2: Update the OPFS store tests**

In `storage/opfs/opfs-project-store.test.ts`:

- line 30: change `root.readFile('alpha/project.json')` to `root.readFile('alpha/vernacular.json')`.
- line 81 title: change `'omits id directories that hold no project.json from the listing'` to `'omits id directories that hold no vernacular.json from the listing'`.
- line 94 title: change `'omits id directories whose project.json lacks a string meta.name from the listing'` to `'omits id directories whose vernacular.json lacks a string meta.name from the listing'`.
- line 97: change `root.writeFile('broken/project.json', ...)` to `root.writeFile('broken/vernacular.json', ...)`.

Leave the `'ghost/.house-autosave/snap.json'` seed on line 83 unchanged (the autosave sidecar keeps its name).

- [ ] **Step 3: Update the zip codec sample entry**

In `storage/zip/zip-codec.test.ts`, line 10, change the representative folder entry key `'project.json'` to `'vernacular.json'`. Leave the `'.house-autosave/snap.json'` entry on line 11 unchanged.

- [ ] **Step 4: Decouple the generic directory contract from the old domain filename**

`storage/fs/directory-contract.ts` exercises a generic byte directory with arbitrary path keys; its use of `'project.json'` is incidental, not the project Document. Replace every `'project.json'` literal in that file with the neutral key `'doc.json'` (including the `'a/project.json'` nested-path cases). Leave all `.house-autosave` keys unchanged.

- [ ] **Step 5: Run the storage tests to verify they fail**

Run: `pnpm exec vitest run storage/folder/folder-project-store.test.ts storage/opfs/opfs-project-store.test.ts`
Expected: FAIL. The folder store's new assertion fails (it still writes `project.json`), the three migration-backup tests now seed `vernacular.json` but the store reads `project.json` and throws `ProjectFileNotFoundError`, and the OPFS round-trip's `alpha/vernacular.json` read returns `undefined`.

- [ ] **Step 6: Commit the RED state**

```bash
git add storage/folder/folder-project-store.test.ts storage/opfs/opfs-project-store.test.ts storage/zip/zip-codec.test.ts storage/fs/directory-contract.ts
git commit -m "test(storage): expect the vernacular.json document filename"
```

### GREEN (implementer)

- [ ] **Step 7: Rename the canonical Document file**

In `storage/folder/folder-project-store.ts`, change line 7 from:

```ts
export const PROJECT_FILE = 'project.json'
```

to:

```ts
export const PROJECT_FILE = 'vernacular.json'
```

Make no other change in this step.

- [ ] **Step 8: Run the storage tests to verify they pass**

Run: `pnpm exec vitest run storage/`
Expected: PASS. The folder, OPFS, and zip-bundle stores all route through the new value.

- [ ] **Step 9: Commit the GREEN state with the breaking-change footer**

```bash
git add storage/folder/folder-project-store.ts
git commit -m "feat(storage)!: rename the project document file to vernacular.json

BREAKING CHANGE: The canonical on-disk project Document is now named
vernacular.json (previously project.json). This is a clean pre-1.0 break
with no compatibility shim; readers target only vernacular.json. Projects
saved under the old name must be re-saved to adopt the new filename."
```

### BLUE (clean-code-review, then refactorer)

- [ ] **Step 10: Refresh the doc comments that still name `project.json`**

Update these comments so they describe the new filename (no behavior change):

- `storage/folder/folder-project-store.ts`: the class doc comment "(project.json at the directory root)" becomes "(vernacular.json at the directory root)".
- `storage/folder/project-json.ts`: the three comments that say "project.json bytes"/"for project.json" become "vernacular.json".
- `storage/opfs/opfs-project-store.ts`: the class doc comment "the project.json codec" becomes "the vernacular.json codec".
- `storage/zip/zip-bundle-project-store.ts`: the class doc comment naming ".house.zip" is handled in Task 2; here, no `project.json` mention exists, so make no change in this file for Task 1.
- `storage/fs/directory-port.ts`: in the example list on lines 3-4, change the `project.json` and `<id>/project.json` illustrations to `vernacular.json` and `<id>/vernacular.json`; leave the `.house-autosave/snapshot.json` example unchanged.
- `storage/fs/subdirectory-port.ts`: change the example "the root path `project.json` reads and writes `prefix/project.json`" to use `vernacular.json`.
- `app/app.tsx`: change the comment "persists underlay rasters beside project.json" to "beside vernacular.json".

- [ ] **Step 11: Verify nothing broke and commit the refactor marker**

Run: `pnpm exec vitest run storage/`
Expected: PASS.

```bash
git add storage/folder/folder-project-store.ts storage/folder/project-json.ts storage/opfs/opfs-project-store.ts storage/fs/directory-port.ts storage/fs/subdirectory-port.ts app/app.tsx
git commit -m "refactor(storage): name vernacular.json in the storage doc comments"
```

If the reviewer surfaced nothing and no comment needed changing, close the cycle with an empty marker instead:

```bash
git commit --allow-empty -m "refactor(storage): no changes after the vernacular.json rename review"
```

---

## Task 2: Rename the export archive extension to `.building`

`bundleFilename` is the single source of the export filename. The suffix constant drives every exported archive name; the fallback stem `'project'` is a name stem, not the old file, and stays.

**Files:**

- Test: `storage/zip/bundle-filename.test.ts`, `e2e/tests/export-bundle.spec.ts`
- Modify: `storage/zip/bundle-filename.ts`
- Refactor comments: `storage/zip/zip-codec.ts`, `storage/zip/zip-bundle-project-store.ts`, `storage/zip/bundle-filename.ts`

### RED (test-author)

- [ ] **Step 1: Update the filename expectations**

In `storage/zip/bundle-filename.test.ts`, change the four expectations to the new extension (the stem logic is unchanged):

```ts
it('lowercases the name and joins words with a single hyphen', () => {
  expect(bundleFilename('My House')).toBe('my-house.building')
})

it('collapses punctuation and double spaces to single hyphens with no leading or trailing hyphen', () => {
  expect(bundleFilename('  Cozy   Cabin!! ')).toBe('cozy-cabin.building')
})

it('falls back to a fixed stem when the name is empty or whitespace only', () => {
  expect(bundleFilename('   ')).toBe('project.building')
})

it('falls back to a fixed stem when the name has only unsafe characters', () => {
  expect(bundleFilename('///')).toBe('project.building')
})
```

- [ ] **Step 2: Update the end-to-end download expectation**

In `e2e/tests/export-bundle.spec.ts`:

- the two header comments that describe a "`.house.zip` archive" and "`untitled-project.house.zip`" become "`.building` archive" and "`untitled-project.building`".
- line 7: `const EXPECTED_FILENAME = 'untitled-project.building'`.
- the test title `'downloads the default project as a named .house.zip bundle'` becomes `'downloads the default project as a named .building bundle'`.

- [ ] **Step 3: Run the unit test to verify it fails**

Run: `pnpm exec vitest run storage/zip/bundle-filename.test.ts`
Expected: FAIL. `bundleFilename('My House')` still returns `my-house.house.zip`.

- [ ] **Step 4: Commit the RED state**

```bash
git add storage/zip/bundle-filename.test.ts e2e/tests/export-bundle.spec.ts
git commit -m "test(storage): expect the .building export archive extension"
```

### GREEN (implementer)

- [ ] **Step 5: Rename the archive suffix**

In `storage/zip/bundle-filename.ts`, change line 5 from:

```ts
const BUNDLE_SUFFIX = '.house.zip'
```

to:

```ts
const BUNDLE_SUFFIX = '.building'
```

Make no other change in this step.

- [ ] **Step 6: Run the unit test to verify it passes**

Run: `pnpm exec vitest run storage/zip/bundle-filename.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit the GREEN state with the breaking-change footer**

```bash
git add storage/zip/bundle-filename.ts
git commit -m "feat(storage)!: rename the export archive extension to .building

BREAKING CHANGE: The shareable export archive now uses the .building
extension (previously .house.zip). This is a clean pre-1.0 break with no
compatibility shim; the exporter writes only *.building archives."
```

### BLUE (clean-code-review, then refactorer)

- [ ] **Step 8: Refresh the archive doc comments**

Update these comments so they describe the new extension (no behavior change):

- `storage/zip/bundle-filename.ts`: the function doc comment that says "A safe `.house.zip` download filename ... Always ends in `.house.zip`." becomes the `.building` wording; rename the `BUNDLE_SUFFIX` comment "The fixed suffix every exported bundle filename ends in" only if it names the old value (it does not, so leave it).
- `storage/zip/zip-codec.ts`: the two comments "Pack folder entries into .house.zip bytes" and "Unpack .house.zip bytes back into folder entries" become ".building" wording.
- `storage/zip/zip-bundle-project-store.ts`: the class doc comment "backed by an in-memory expansion of a .house.zip bundle" becomes ".building bundle".

- [ ] **Step 9: Verify and commit the refactor marker**

Run: `pnpm exec vitest run storage/zip/`
Expected: PASS.

```bash
git add storage/zip/bundle-filename.ts storage/zip/zip-codec.ts storage/zip/zip-bundle-project-store.ts
git commit -m "refactor(storage): name .building in the archive doc comments"
```

---

## Task 3: Residual cleanup and full verification

**Files:**

- Modify: `tests/fixtures/projects/README.md` (if it still names `*.project.json`)

- [ ] **Step 1: Update the fixtures README**

Read `tests/fixtures/projects/README.md`. If it describes the fixtures as `*.project.json`, change that to `*.vernacular.json` to match the filenames Plan 1 introduced. Commit as documentation (audit-exempt):

```bash
git add tests/fixtures/projects/README.md
git commit -m "docs: describe the project fixtures as vernacular.json"
```

If the README already says `*.vernacular.json`, skip this commit.

- [ ] **Step 2: Grep for stragglers outside historical records**

Run:

```bash
rg -n --hidden -g '!node_modules' -g '!pnpm-lock.yaml' -g '!.git' -g '!docs/**' -g '!ROADMAP.md' -g '!CHANGELOG.md' 'project\.json|\.house\.zip' .
```

Expected: no matches. Every remaining hit must be either a deliberately retained `.house-autosave` reference (which this pattern does not match) or a historical doc/ADR/roadmap/changelog entry (excluded above). If a live code or test reference remains, fold it into the appropriate task's cycle before continuing.

- [ ] **Step 3: Run the full check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 4: Run the end-to-end export spec**

Run: `pnpm exec playwright test e2e/tests/export-bundle.spec.ts` (rebuild first if the harness requires it; kill any stale preview server on port 4173).
Expected: PASS on Chromium and Firefox (WebKit self-skips per the existing guard).

- [ ] **Step 5: Confirm the audit is clean**

Run: `pnpm rgb:audit origin/main..HEAD`
Expected: clean. Each rename cycle reads `test:` then `feat!:` then `refactor:`; the `test(e2e)` edit rode inside Task 2's `test:` commit and the README is a `docs:` commit, both acceptable.

- [ ] **Step 6: Final review**

Dispatch the `pr-reviewer` over `origin/main..HEAD`. Address any must-fix findings in-cycle. The branch stays local (push and PR hold active).

---

## Self-review notes

- **Spec coverage:** section 2.1 (the Document is named `vernacular.json`) is implemented by Task 1; section 2.3 (the Archive uses the `.building` extension) by Task 2; section 2.4 (clean rename, no shim, recorded in release notes) by the `BREAKING CHANGE:` footers and the no-shim value swaps. The retained `.house-autosave/` honors section 2.2.
- **No silent design-spec edits:** the design specification, ROADMAP, ADRs, and CHANGELOG stay as historical or generated records, per the out-of-scope list and the CLAUDE.md ADR gate.
- **Name consistency:** `PROJECT_FILE`, `BUNDLE_SUFFIX`, `bundleFilename`, `FolderProjectStore`, and the `'vernacular.json'` / `'.building'` string values are used identically across tasks.
