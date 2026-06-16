# Asset Pack Format and Build CLI Implementation Plan

> **For agentic workers:** This plan is executed with role-separated red-green-blue TDD. Each cycle is `test:` (test-author) then `feat:` (implementer) then `refactor:` (refactorer, possibly an empty marker), dispatched from the main thread. Steps use checkbox (`- [ ]`) syntax for tracking. Run the gate (`pnpm typecheck && pnpm lint && pnpm test`) and `pnpm rgb:audit origin/main..HEAD` after each cycle; run `format:check`, `build`, and the pack tests before declaring done.

**Goal:** Grow the `vernacular-pack` scaffold from a manifest shape-checker into an integrity and build pipeline that verifies a pack's on-disk files against its manifest, enforces an open-license policy, and emits a build report.

**Architecture:** Three pure units behind dependency-injected seams under `scripts/pack/` (license policy, an extended manifest contract, on-disk integrity), composed by the existing `runPackCli`. No new dependency, no build step; the schema stays JSDoc-typed ESM and graduates to `core/` later in #174 (ADR-0024 graduation plan). Two fixture packs (one well-formed, one deliberately broken) give the integrity and build paths real bytes.

**Tech Stack:** Node ESM with JSDoc types, Vitest (`*.test.mjs`), `node:crypto` sha256, `node:fs/promises`. Grounded in `docs/specs/2026-06-16-asset-pack-format-and-cli.md`, ADR-0007 (content addressing), ADR-0024 (validator location and graduation).

---

## Execution conventions

- **Worktree:** `~/workspace/vernacular.wt/asset-pack-cli`, branch `feat/asset-pack-format-cli`, off `origin/main` (`7da34ec1`). All work is local; do not push, open PRs, or touch GitHub until the owner lifts the hold.
- **Role separation:** the `test-author` subagent writes the failing test and may not read implementation source; the `implementer` writes the minimal passing code and may not read tests; the `refactorer` cleans implementation while tests stay green. Tell each subagent the exact allowed files for its cycle and to STOP rather than edit shared config (see the per-task "Allowed files" lists).
- **Commit discipline:** every GREEN is closed by a BLUE marker (a real `refactor:` or an empty `refactor:` marker commit) before the next RED. `.mjs` test files count as tests for `rgb:audit`. Commit subjects are Conventional Commits with no milestone tags, no `Co-Authored-By`, no em-dashes.
- **Lint traps to anticipate** (`.claude/rules.md`): functions <= 40 lines, files <= 300 lines, <= 3 params, no magic numbers, no nested ternaries. Name every numeric constant (header lengths, byte values). Keep helpers small from the first GREEN so the BLUE phase is genuinely a marker.

## File structure

| File                                                                     | Responsibility                                                                                                                                                                                             | Status |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `scripts/pack/license-policy.mjs`                                        | Curated open-license allowlist; `recognize`, `isShareAlike`, `isNoRedistribution`, `licenseProblems`, `shareAlikeWarning`. Pure.                                                                           | Create |
| `scripts/pack/license-policy.test.mjs`                                   | Unit tests for every license outcome.                                                                                                                                                                      | Create |
| `scripts/pack/manifest-validation.mjs`                                   | Adds per-asset `attribution`/`eras`/`categories`/optional `sourceUrl`, pack-level `eras`/`categories`, and delegates license checks to the policy.                                                         | Modify |
| `scripts/pack/manifest-validation.test.mjs`                              | New assertions for the added fields and the delegated license errors.                                                                                                                                      | Modify |
| `scripts/pack/pack-integrity.mjs`                                        | `checkPackIntegrity(manifest, reader)` and `isWebp(bytes)`; content-hash verification, thumbnail presence/signature, orphan detection, required files, directory name. Pure over an injected `PackReader`. | Create |
| `scripts/pack/pack-integrity.test.mjs`                                   | Unit tests for every integrity outcome via a fake reader.                                                                                                                                                  | Create |
| `scripts/pack/vernacular-pack.mjs`                                       | Composes manifest + integrity + license warnings into `validate`; `build` writes `build-report.json` through an injected sink. Widened `PackCliDeps`; preserved exit codes.                                | Modify |
| `scripts/pack/vernacular-pack.test.mjs`                                  | New assertions for the composed `validate`/`build` paths via fakes.                                                                                                                                        | Modify |
| `scripts/pack/vernacular-pack.integration.test.mjs`                      | End-to-end smoke against the two fixture packs with real readers and an in-memory report sink.                                                                                                             | Create |
| `tests/fixtures/packs/vernacular-starter-1.0.0/`                         | Well-formed fixture pack (manifest + asset + thumbnail + LICENSE/NOTICE/CHANGELOG.md).                                                                                                                     | Create |
| `tests/fixtures/packs/broken-pack-wrong/`                                | Deliberately broken fixture pack exercising the failure paths.                                                                                                                                             | Create |
| `scripts/pack/generate-fixtures.mjs`                                     | One-shot generator that writes the fixture bytes and the manifests with correct hashes. Run once, kept for reproducibility.                                                                                | Create |
| `.claude/agents/pack-validator.md`                                       | Refresh to the integrity + build contract.                                                                                                                                                                 | Modify |
| `docs/knowledge/decisions/ADR-0091-pack-integrity-and-build-pipeline.md` | Record the integrity, license-policy, and build-report decision.                                                                                                                                           | Create |

## Module contracts (target signatures)

These signatures are the shared contract. The implementer reproduces them; the test-author writes to them from the public JSDoc.

### `license-policy.mjs`

```js
// Curated, redistribution-friendly open licenses (spec 4.8). Not the full SPDX list.
export const RECOGNIZED_LICENSES = Object.freeze([
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
])

// Share-alike: redistribution-friendly but viral; warns when mixed with others.
export const SHARE_ALIKE_LICENSES = Object.freeze(['CC-BY-SA-4.0', 'CC-BY-SA-3.0'])

// Known conflicts with an openly redistributable, modifiable pack (NonCommercial / NoDerivatives).
export const NON_REDISTRIBUTABLE_LICENSES = Object.freeze([
  'CC-BY-NC-4.0',
  'CC-BY-NC-3.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-ND-4.0',
  'CC-BY-ND-3.0',
  'CC-BY-NC-ND-4.0',
])

export function recognize(licenseId) {} // boolean: in the allowlist
export function isShareAlike(licenseId) {} // boolean
export function isNoRedistribution(licenseId) {} // boolean
export function licenseProblems(licenseId) {} // string[]: hard errors for one license
export function shareAlikeWarning(licenseIds) {} // string | null: warning across the pack
```

`licenseProblems(id)`:

- if `isNoRedistribution(id)` -> `['license "<id>" forbids redistribution and cannot ship in an open pack']`
- else if not `recognize(id)` -> `['license "<id>" is not a recognized open license']`
- else -> `[]`

`shareAlikeWarning(ids)`: let `distinct = [...new Set(ids)]`. If some `distinct` is share-alike AND `distinct.length > 1`, return `'pack mixes a share-alike license with other licenses; redistribution must preserve the share-alike terms'`; else `null`.

### `pack-integrity.mjs`

```js
/**
 * @typedef {object} PackReader
 * @property {string} dirName                                   basename of the pack directory
 * @property {(rel: string) => Promise<string[]>} listDir       filenames in a subdir; [] if absent
 * @property {(rel: string) => Promise<boolean>} exists
 * @property {(rel: string) => Promise<string>} sha256          hex digest of a file's bytes
 * @property {(rel: string, length: number) => Promise<Uint8Array>} readBytes
 */

export function isWebp(bytes) {} // RIFF....WEBP signature, >= 12 bytes
export async function checkPackIntegrity(manifest, reader) {} // returns { errors: string[] }
```

Constants: `WEBP_HEADER_LENGTH = 12`, `RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]`, `WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]`, `WEBP_TAG_OFFSET = 8`, `ASSET_DIR = 'assets'`, `THUMBNAIL_DIR = 'thumbnails'`, `ASSET_EXTENSION = '.glb'`, `THUMBNAIL_EXTENSION = '.webp'`, `REQUIRED_FILES = ['LICENSE', 'NOTICE', 'CHANGELOG.md']`, `SHA256_PATTERN = /^[0-9a-f]{64}$/`.

`checkPackIntegrity` accumulates errors from small helpers (each <= 40 lines, <= 3 params):

- per asset with a 64-hex `contentHash` (skip malformed-hash assets; the manifest contract already flags those): confirm `assets/<hash>.glb` exists and `sha256` equals `<hash>`, else `content hash mismatch` / `asset file missing`; confirm `thumbnails/<hash>.webp` exists and `isWebp(readBytes(..., WEBP_HEADER_LENGTH))`, else `thumbnail missing` / `thumbnail is not valid WebP`.
- orphans: any file in `assets/` not named `<referencedHash>.glb`, any file in `thumbnails/` not named `<referencedHash>.webp`.
- required files: each of `REQUIRED_FILES` exists.
- directory name: `reader.dirName === \`${manifest.packId}-${manifest.version}\``.

### `vernacular-pack.mjs` (widened deps)

```js
/**
 * @typedef {object} PackCliDeps
 * @property {(packDir: string) => Promise<unknown>} readManifest
 * @property {(packDir: string) => PackReader} createReader
 * @property {(packDir: string, report: object) => Promise<void>} writeReport
 * @property {(message: string) => void} log
 * @property {(message: string) => void} error
 */
```

`runPackCli(argv, deps)` keeps the existing exit codes (`0` ok, `1` invalid/unreadable, `2` usage, `3` internal shim fault). New flow:

1. parse + read manifest (unchanged guards).
2. `review = await reviewPack(manifest, deps.createReader(packDir))` where `reviewPack` runs `validatePackManifest`, runs `checkPackIntegrity` when the manifest is an object with an `assets` array, and computes `shareAlikeWarning` over the collected pack + asset licenses; returns `{ errors: string[], warnings: string[] }`.
3. `validate`: log each warning, report each error and return `EXIT_INVALID` if any, else log success and return `EXIT_OK`.
4. `build`: write `buildReport(manifest, review)` through `deps.writeReport`, then behave as `validate` for exit code. The report shape: `{ status: 'PASS' | 'FAIL', assets: [{ name, contentHash }], licenses: { distinct: string[], shareAlike: boolean }, warnings: string[], errors: string[] }`.

Also export `readManifestFromDisk`, `createNodePackReader`, and `writeReportToDisk` (thin `node:fs`/`node:crypto` adapters) so the integration test can use real readers. The build report is written to a sibling path (`<dirname>/<basename>-build-report.json`), kept out of the immutable pack content.

---

## Task 1: License policy module

**Allowed files:** `scripts/pack/license-policy.mjs`, `scripts/pack/license-policy.test.mjs`.

### Cycle 1.1: recognized vs unrecognized

- [ ] **RED** `test:` Test `recognize` returns true for each id in `RECOGNIZED_LICENSES` and false for an unknown id (`'Weird-1.0'`); assert `RECOGNIZED_LICENSES` includes `'CC0-1.0'`, `'CC-BY-4.0'`, `'MIT'`, `'Apache-2.0'`.

```js
import { describe, expect, it } from 'vitest'
import { RECOGNIZED_LICENSES, recognize } from './license-policy.mjs'

describe('recognize', () => {
  it('accepts every curated open license', () => {
    for (const id of RECOGNIZED_LICENSES) expect(recognize(id)).toBe(true)
  })
  it('rejects an unknown identifier', () => {
    expect(recognize('Weird-1.0')).toBe(false)
  })
})
```

Run: `pnpm exec vitest run scripts/pack/license-policy.test.mjs` -> FAIL (module missing).

- [ ] **GREEN** `feat:` Add `RECOGNIZED_LICENSES` frozen array and `recognize`. Run the file -> PASS.
- [ ] **BLUE** `refactor:` Clean or empty marker. Gate + `rgb:audit`.

### Cycle 1.2: share-alike detection

- [ ] **RED** `test:` `isShareAlike('CC-BY-SA-4.0')` true; `isShareAlike('CC-BY-4.0')` and `isShareAlike('MIT')` false.
- [ ] **GREEN** `feat:` Add `SHARE_ALIKE_LICENSES` + `isShareAlike`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 1.3: no-redistribution detection

- [ ] **RED** `test:` `isNoRedistribution('CC-BY-NC-4.0')` and `isNoRedistribution('CC-BY-ND-4.0')` true; `isNoRedistribution('CC0-1.0')` false.
- [ ] **GREEN** `feat:` Add `NON_REDISTRIBUTABLE_LICENSES` + `isNoRedistribution`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 1.4: per-license problems

- [ ] **RED** `test:` `licenseProblems('CC0-1.0')` -> `[]`; `licenseProblems('Weird-1.0')` -> one message containing `not a recognized`; `licenseProblems('CC-BY-NC-4.0')` -> one message containing `forbids redistribution`.
- [ ] **GREEN** `feat:` Compose `licenseProblems` from `isNoRedistribution` + `recognize`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 1.5: pack-wide share-alike warning

- [ ] **RED** `test:` `shareAlikeWarning(['CC-BY-SA-4.0', 'CC0-1.0'])` returns a string containing `share-alike`; `shareAlikeWarning(['CC0-1.0', 'MIT'])` and `shareAlikeWarning(['CC-BY-SA-4.0', 'CC-BY-SA-4.0'])` return `null`.
- [ ] **GREEN** `feat:` Add `shareAlikeWarning` (distinct set, mixed-with-others rule).
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 2: Manifest contract extension

**Allowed files:** `scripts/pack/manifest-validation.mjs`, `scripts/pack/manifest-validation.test.mjs`. (The implementer imports from `./license-policy.mjs`, already on disk.)

Note: the fixtures and the `validManifest()`/`validAsset()` helpers already carry `eras`, `categories`, and per-asset `attribution`; today they pass as ignored extras. Each cycle below adds a `delete`-the-field or wrong-shape case that must fail, then makes it required.

### Cycle 2.1: per-asset attribution required

- [ ] **RED** `test:` From `validAsset()`, `delete asset.attribution`; expect an error mentioning `attribution`.

```js
it('requires attribution on each asset', () => {
  const asset = { ...validAsset() }
  delete asset.attribution
  const result = validatePackManifest({ ...validManifest(), assets: [asset] })
  expect(result.valid).toBe(false)
  expect(result.errors.some((m) => m.includes('attribution'))).toBe(true)
})
```

- [ ] **GREEN** `feat:` In `validateAsset`, `validateRequiredString(source, 'attribution', errors, \`${label}.attribution\`)`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.2: per-asset eras required (non-empty string array)

- [ ] **RED** `test:` Cases: missing `eras`, `eras: []`, `eras: ['']`, `eras: 'mid-century'` (not an array) each invalid; a well-formed `eras: ['mid-century']` valid.
- [ ] **GREEN** `feat:` Add `validateRequiredStringArray(source, key, errors, label)` (array, length >= 1, every entry a non-empty string) and call it for `eras` in `validateAsset`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.3: per-asset categories required

- [ ] **RED** `test:` Same four invalid shapes for `categories`; well-formed `categories: ['seating']` valid.
- [ ] **GREEN** `feat:` Call `validateRequiredStringArray` for `categories` in `validateAsset`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.4: optional sourceUrl shape

- [ ] **RED** `test:` Asset with no `sourceUrl` valid; `sourceUrl: 'https://example.org/chair'` valid; `sourceUrl: 'not a url'` and `sourceUrl: 42` invalid with an error mentioning `sourceUrl`.
- [ ] **GREEN** `feat:` Add `validateOptionalUrl(source, key, errors, label)`: when the field is present it must be a string starting with `http://` or `https://` (constant `URL_PREFIX_PATTERN = /^https?:\/\/\S+$/`); call it in `validateAsset`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.5: pack-level eras and categories required

- [ ] **RED** `test:` From `validManifest()`, `delete eras` then `delete categories`; each invalid with a matching error.
- [ ] **GREEN** `feat:` Call `validateRequiredStringArray` for `eras` and `categories` at the top level in `validatePackManifest`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 2.6: delegate license recognition

- [ ] **RED** `test:` Asset `license: 'Weird-1.0'` invalid with `not a recognized`; asset `license: 'CC-BY-NC-4.0'` invalid with `forbids redistribution`; pack-level `license: 'Weird-1.0'` invalid. A recognized license (`'CC0-1.0'`) stays valid.

```js
it('rejects an unrecognized asset license via the policy', () => {
  const result = validatePackManifest({
    ...validManifest(),
    assets: [{ ...validAsset(), license: 'Weird-1.0' }],
  })
  expect(result.valid).toBe(false)
  expect(result.errors.some((m) => m.includes('not a recognized'))).toBe(true)
})
```

- [ ] **GREEN** `feat:` Import `licenseProblems` from `./license-policy.mjs`. After the required-string check for `license` (asset and pack level), when the value is a non-empty string push `...licenseProblems(String(value))` into `errors`.
- [ ] **BLUE** `refactor:` marker. Confirm the existing "accepts a well-formed manifest/asset" tests still pass (CC0-1.0 is recognized). Gate + audit.

---

## Task 3: On-disk integrity module

**Allowed files:** `scripts/pack/pack-integrity.mjs`, `scripts/pack/pack-integrity.test.mjs`.

Test helper (fake reader) the test-author builds:

```js
function fakeReader(overrides = {}) {
  return {
    dirName: 'vernacular-starter-1.0.0',
    listDir: async (rel) => overrides.dirs?.[rel] ?? [],
    exists: async (rel) => Boolean(overrides.files?.[rel]),
    sha256: async (rel) => overrides.hashes?.[rel] ?? '',
    readBytes: async (rel) => overrides.bytes?.[rel] ?? new Uint8Array(),
    ...overrides.reader,
  }
}
const HASH = 'a'.repeat(64)
function manifestWith(asset = {}) {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    assets: [{ contentHash: HASH, name: 'Chair', ...asset }],
  }
}
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
```

### Cycle 3.1: passing pack (hash match, thumbnail present, files present, name match)

- [ ] **RED** `test:` A reader where `assets/<HASH>.glb` exists with `sha256` = `HASH`, `thumbnails/<HASH>.webp` exists with `WEBP_BYTES`, `assets`/`thumbnails` list exactly those files, `LICENSE`/`NOTICE`/`CHANGELOG.md` exist, `dirName` matches -> `checkPackIntegrity` returns `{ errors: [] }`.
- [ ] **GREEN** `feat:` Implement `isWebp` and `checkPackIntegrity` with the per-asset, orphan, required-file, and dir-name helpers. Return `{ errors: [] }` for the happy path.
- [ ] **BLUE** `refactor:` Split helpers to keep each <= 40 lines. Gate + audit.

### Cycle 3.2: content-hash mismatch

- [ ] **RED** `test:` `assets/<HASH>.glb` exists but `sha256` returns a different digest -> an error containing `content hash`.
- [ ] **GREEN** `feat:` Compare `sha256` to the declared hash in the per-asset helper.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.3: missing asset file

- [ ] **RED** `test:` `assets/<HASH>.glb` does not exist -> error containing `asset file missing`.
- [ ] **GREEN** `feat:` Guard the per-asset helper on `exists` before hashing.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.4: missing thumbnail

- [ ] **RED** `test:` `thumbnails/<HASH>.webp` does not exist -> error containing `thumbnail missing`.
- [ ] **GREEN** `feat:` Add the thumbnail-presence check.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.5: invalid WebP thumbnail

- [ ] **RED** `test:` `thumbnails/<HASH>.webp` exists but `readBytes` returns non-WebP bytes (`new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12])`) -> error containing `not valid WebP`; also a direct `isWebp(WEBP_BYTES)` true / `isWebp` of non-WebP false unit assertion.
- [ ] **GREEN** `feat:` Add the `isWebp(readBytes(..., WEBP_HEADER_LENGTH))` check.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.6: orphan files

- [ ] **RED** `test:` `assets` lists `[<HASH>.glb, orphan.glb]` and `thumbnails` lists `[<HASH>.webp, stray.webp]` -> two errors, one per orphan, each naming the file.
- [ ] **GREEN** `feat:` Add orphan detection for both dirs against the referenced-name sets.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.7: missing required files

- [ ] **RED** `test:` `NOTICE` absent -> error containing `NOTICE`; assert each of `LICENSE`/`NOTICE`/`CHANGELOG.md` is checked.
- [ ] **GREEN** `feat:` Add the required-file presence loop.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 3.8: directory name mismatch

- [ ] **RED** `test:` `dirName: 'wrong-name'` with packId/version `vernacular-starter`/`1.0.0` -> error containing `vernacular-starter-1.0.0`.
- [ ] **GREEN** `feat:` Add the `dirName` comparison.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 4: CLI composition

**Allowed files:** `scripts/pack/vernacular-pack.mjs`, `scripts/pack/vernacular-pack.test.mjs`. (Imports from `./manifest-validation.mjs`, `./pack-integrity.mjs`, `./license-policy.mjs`.)

The test-author extends `deps(manifest)` to add `createReader` (returns a configurable fake reader) and `writeReport` (a `vi.fn()` capturing the report). The existing usage/read-failure/internal tests stay green.

### Cycle 4.1: validate surfaces integrity errors

- [ ] **RED** `test:` A manifest that passes shape validation but whose fake reader reports a content-hash mismatch -> `runPackCli(['validate', dir], deps)` returns `1` and `error` is called with a message containing `content hash`.
- [ ] **GREEN** `feat:` Add `reviewPack` (manifest + gated integrity + share-alike warning), refactor `runPackCli` to route through it, report combined errors in `validate`.
- [ ] **BLUE** `refactor:` Extract `runValidate`/`runBuild`/`reviewPack`/`collectLicenses`/`buildReport` helpers so `runPackCli` stays small. Gate + audit.

### Cycle 4.2: validate surfaces a share-alike warning without failing

- [ ] **RED** `test:` A fully valid pack (clean fake reader) whose manifest mixes `CC-BY-SA-4.0` and `CC0-1.0` -> returns `0`, `log` called with a message containing `share-alike`, `error` not called.
- [ ] **GREEN** `feat:` Log warnings before the error gate in `runValidate`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 4.3: build writes a PASS report

- [ ] **RED** `test:` Valid pack + clean fake reader -> `runPackCli(['build', dir], deps)` returns `0`; `writeReport` called once with a report whose `status === 'PASS'`, whose `assets` carry the manifest `name`/`contentHash`, and whose `licenses.distinct` includes the pack license.
- [ ] **GREEN** `feat:` Add `buildReport` + `runBuild` writing through `deps.writeReport`.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 4.4: build writes a FAIL report on an invalid pack

- [ ] **RED** `test:` Manifest valid in shape but fake reader reports a mismatch -> `build` returns `1`; `writeReport` called with `status === 'FAIL'` and a non-empty `errors`; `error` called.
- [ ] **GREEN** `feat:` Set report `status` from `review.errors.length` and keep the invalid exit path.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

### Cycle 4.5: real adapters exported

- [ ] **RED** `test:` Import `readManifestFromDisk`, `createNodePackReader`, `writeReportToDisk` and assert they are functions and `createNodePackReader('x').dirName === 'x'` (basename). (Shape-only; behavior is covered by the integration test in Task 5.)
- [ ] **GREEN** `feat:` Export the three `node:fs`/`node:crypto` adapters and wire them into the direct-invocation shim.
- [ ] **BLUE** `refactor:` marker. Gate + audit.

---

## Task 5: Fixture packs and integration smoke

**Allowed files:** `scripts/pack/generate-fixtures.mjs`, `scripts/pack/vernacular-pack.integration.test.mjs`, everything under `tests/fixtures/packs/vernacular-starter-1.0.0/` and `tests/fixtures/packs/broken-pack-wrong/`. This task creates test data plus an integration test; commit the generator and fixtures as `test:` and the smoke as a normal RGB pair.

### Cycle 5.1: fixtures and end-to-end smoke

- [ ] **Step 1 — write the generator** `scripts/pack/generate-fixtures.mjs`: a Node script that writes both fixture trees deterministically.

```js
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../tests/fixtures/packs/', import.meta.url))
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
// 12-byte minimal WebP signature: "RIFF" + size + "WEBP" (enough for the signature check).
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

async function writePack(name, manifest, files) {
  const dir = join(root, name)
  await rm(dir, { recursive: true, force: true })
  for (const [rel, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true })
    await writeFile(join(dir, rel), bytes)
  }
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

async function main() {
  // Well-formed pack.
  const glb = Buffer.from('vernacular starter chair glb placeholder\n')
  const hash = sha256(glb)
  await writePack(
    'vernacular-starter-1.0.0',
    {
      packId: 'vernacular-starter',
      version: '1.0.0',
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['mid-century'],
      categories: ['seating'],
      assets: [
        {
          contentHash: hash,
          name: 'Example chair',
          kind: 'furniture',
          license: 'CC0-1.0',
          attribution: 'Vernacular project',
          eras: ['mid-century'],
          categories: ['seating'],
          dimensions: { width: 500, depth: 520, height: 800 },
        },
      ],
    },
    {
      [`assets/${hash}.glb`]: glb,
      [`thumbnails/${hash}.webp`]: webp,
      LICENSE: 'CC0-1.0\n',
      NOTICE: 'Vernacular project\n',
      'CHANGELOG.md': '# 1.0.0\n',
    },
  )

  // Broken pack: dir name mismatch, hash mismatch, missing thumbnail, no-redistribution
  // license, orphan asset, missing NOTICE.
  const brokenGlb = Buffer.from('broken chair bytes\n')
  const claimedHash = sha256(Buffer.from('different bytes\n')) // != sha256(brokenGlb)
  await writePack(
    'broken-pack-wrong',
    {
      packId: 'broken-pack',
      version: '1.0.0',
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['edwardian'],
      categories: ['seating'],
      assets: [
        {
          contentHash: claimedHash,
          name: 'Broken chair',
          kind: 'furniture',
          license: 'CC-BY-NC-4.0',
          attribution: 'Vernacular project',
          eras: ['edwardian'],
          categories: ['seating'],
          dimensions: { width: 500, depth: 520, height: 800 },
        },
      ],
    },
    {
      [`assets/${claimedHash}.glb`]: brokenGlb, // bytes hash != claimedHash -> mismatch
      'assets/orphan.glb': Buffer.from('orphan\n'),
      LICENSE: 'CC0-1.0\n',
      'CHANGELOG.md': '# 1.0.0\n', // NOTICE intentionally absent
    },
  )
}
main()
```

- [ ] **Step 2 — generate the fixtures** Run: `node scripts/pack/generate-fixtures.mjs`. Confirm both trees exist (`ls -R tests/fixtures/packs/vernacular-starter-1.0.0 tests/fixtures/packs/broken-pack-wrong`).
- [ ] **Step 3 — commit fixtures + generator** `test: add well-formed and broken pack fixtures (#173)`.
- [ ] **Step 4 — RED: write the integration smoke** `scripts/pack/vernacular-pack.integration.test.mjs`:

```js
import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPackCli, createNodePackReader, readManifestFromDisk } from './vernacular-pack.mjs'

const packs = fileURLToPath(new URL('../../tests/fixtures/packs/', import.meta.url))
function deps() {
  const reports = []
  return {
    reports,
    readManifest: readManifestFromDisk,
    createReader: createNodePackReader,
    writeReport: (_dir, report) => {
      reports.push(report)
      return Promise.resolve()
    },
    log: vi.fn(),
    error: vi.fn(),
  }
}

describe('vernacular-pack against fixtures', () => {
  it('validates and builds the well-formed pack', async () => {
    const d = deps()
    expect(await runPackCli(['validate', join(packs, 'vernacular-starter-1.0.0')], d)).toBe(0)
    expect(await runPackCli(['build', join(packs, 'vernacular-starter-1.0.0')], d)).toBe(0)
    expect(d.reports.at(-1).status).toBe('PASS')
    expect(d.error).not.toHaveBeenCalled()
  })

  it('reports every distinct problem in the broken pack', async () => {
    const d = deps()
    expect(await runPackCli(['validate', join(packs, 'broken-pack-wrong')], d)).toBe(1)
    const messages = d.error.mock.calls.map((c) => c[0]).join('\n')
    expect(messages).toMatch(/content hash/)
    expect(messages).toMatch(/thumbnail missing/)
    expect(messages).toMatch(/forbids redistribution/)
    expect(messages).toMatch(/orphan/)
    expect(messages).toMatch(/NOTICE/)
    expect(messages).toMatch(/broken-pack-1\.0\.0/) // expected dir name
  })
})
```

Run: `pnpm exec vitest run scripts/pack/vernacular-pack.integration.test.mjs` -> initially FAIL if any wiring is incomplete.

- [ ] **Step 5 — GREEN** Fix any remaining adapter/orphan-message wording so the smoke passes. No new behavior beyond Tasks 1-4; if it passes immediately, this is a green-on-first-run integration test (allowed) and the next commit is the BLUE marker.
- [ ] **Step 6 — commit** `test: smoke vernacular-pack against the fixture packs (#173)` then a `refactor:` marker.
- [ ] **Step 7 — manual CLI check** Run `pnpm pack:validate tests/fixtures/packs/vernacular-starter-1.0.0` (exit 0) and `pnpm pack:validate tests/fixtures/packs/broken-pack-wrong` (exit 1, lists every problem). Run `pnpm pack:build tests/fixtures/packs/vernacular-starter-1.0.0` and confirm a sibling `tests/fixtures/packs/vernacular-starter-1.0.0-build-report.json` with `"status": "PASS"`; then delete that generated report so it is not committed (`git status` clean except intended files).

---

## Task 6: Agent refresh and ADR

**Allowed files:** `.claude/agents/pack-validator.md`, `docs/knowledge/decisions/ADR-0091-pack-integrity-and-build-pipeline.md`, and an `updated`/status note in `docs/knowledge/decisions/ADR-0024-pack-manifest-validation-location.md`. These are `docs:` commits, exempt from the RGB sequence.

- [ ] **Step 1 — refresh the agent** Update `.claude/agents/pack-validator.md` so its workflow reflects the graduated contract: `pnpm pack:validate` now performs on-disk integrity (content-hash verification, thumbnail presence and WebP signature, orphan detection, required `LICENSE`/`NOTICE`/`CHANGELOG.md`, directory name), and license checks defer to the curated open-license policy (recognized, share-alike warning, no-redistribution block). Keep its read-only, report-don't-fix stance. Commit `docs: refresh pack-validator agent for the integrity pipeline (#173)`.
- [ ] **Step 2 — write the ADR** Create `ADR-0091-pack-integrity-and-build-pipeline.md`: status accepted/landed; context (the scaffold validated manifest shape only; ADR-0024 named the missing integrity/license/build pieces; ADR-0007 fixes the content-addressing contract); decision (three pure DI units under `scripts/pack/`: extended manifest contract, license policy, on-disk integrity; the CLI composes them; `build` emits a `build-report.json` through an injected sink kept out of the immutable pack; thumbnails are validated by signature, not baked); consequences and the deferred items (schema graduation to `core/` rides with #174, thumbnail baking and a signed zipped distributable remain later phases). Reference ADR-0007, ADR-0024, and the spec. Run the prose through the `humanizer` skill before committing (ADRs are human-read). Commit `docs: ADR-0091 pack integrity and build pipeline (#173)`.
- [ ] **Step 3 — cross-link ADR-0024** Bump ADR-0024's `updated` date and add a one-line note that the integrity/build pipeline it anticipated landed as ADR-0091. Commit `docs: note the integrity pipeline landing in ADR-0024 (#173)`.
- [ ] **Step 4 — regenerate the local index (optional)** `pnpm knowledge:index` (gitignored output; skip if it adds noise).

---

## Final verification (before declaring done)

- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean (0 errors; no net-new warnings).
- [ ] `pnpm format:check` clean.
- [ ] `pnpm test` green (full unit suite, including the new `scripts/pack/*.test.mjs`).
- [ ] `pnpm build` succeeds.
- [ ] `pnpm rgb:audit origin/main..HEAD` clean (every cycle is test -> feat -> refactor; docs/test-fixture commits exempt).
- [ ] `pnpm pack:validate` exits 0 on the well-formed fixture and 1 on the broken fixture; `pnpm pack:build` writes a PASS report for the well-formed fixture (then remove the generated sibling report).
- [ ] Working tree clean: no stray `build-report.json`, no gitignored index files staged.

## Self-review against the spec

- Manifest contract (spec scope bullet 1): per-asset `attribution`, `eras`, `categories`, optional `sourceUrl`, delegated license -> Task 2 (2.1-2.6). Covered.
- License policy (bullet 2): allowlist + `recognize`/`isNoRedistribution`/share-alike, errors + warnings -> Task 1 (1.1-1.5). Covered.
- On-disk integrity (bullet 3): content-hash verification, asset + thumbnail presence, orphan detection, required-file presence, directory naming, pure over injected listing + hasher -> Task 3 (3.1-3.8). Covered.
- CLI (bullet 4): compose into `validate`; `build` writes `build-report.json`; widened deps; preserved exit codes -> Task 4 (4.1-4.5). Covered.
- Two fixture packs (bullet 5) -> Task 5. Covered.
- Agent refresh + ADR (bullet 6) -> Task 6. Covered.
- Verification (spec section): unit tests per field/outcome through injected seams (Tasks 1-4), `pnpm pack:validate`/`pack:build` against fixtures (Task 5), full check chain (Final verification). Covered.
- Deferred items (schema-to-`core/`, thumbnail baking, signed zip, `AssetRegistry`) are explicitly out of scope and recorded in the ADR. No tasks added for them by design.
