# Vernacular Floor Plan Format: schema generation and validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a committed, machine-readable JSON Schema for the Vernacular Floor Plan Format CORE model, validate Documents against it with a `core/` validator, guard against schema drift, and ship conformant project fixtures.

**Architecture:** The TypeScript types in `core/model/` stay the single source of truth. A Node build script runs `ts-json-schema-generator` over `core/model/types.ts` and writes `schema/<version>/vernacular.schema.json`. A pure `core/format/` module wraps Ajv to validate a Document against a supplied schema (so `core/` stays decoupled from the file's on-disk location). Tests in `tests/format/` load the committed schema and validate fixtures and a regenerated schema (the drift guard). The model gains an additive optional `extensions` member on each entity so the strict schema still admits reverse-DNS-namespaced third-party data.

**Tech Stack:** TypeScript, pnpm (exact pins, 30-day cooldown), Vitest, `ts-json-schema-generator` (build-time), `ajv` (validation).

**Spec:** `docs/specs/2026-06-10-vernacular-floor-plan-format.md`. **Decision:** ADR-0047.

**Scope and decomposition.** This is plan 1 of a decomposed set. It delivers the published schema, the validator, the drift guard, and conformant fixtures, all shippable and testable on their own. Deferred to follow-on plans, not implemented here:

- **Plan 2 (rename):** `project.json` to `vernacular.json` and `.house.zip` to `.building` across the storage layer, with the release-notes deprecation. A clean pre-1.0 break, no compatibility shim.
- **Plan 3 (preservation and app wiring):** the forward-compatibility preservation rule (round-trip unknown `extensions` and reserved keys through the store's load and save), validate-after-migration on app load, and the optional Strict profile.
- **Plan 4 (fixture corpus):** generate Tier-0 underlay and Tier-1 faithful fixtures from the floor-plan image corpus.

---

## Before you start (integration coordination)

Other integration work is in flight in sibling worktrees, so this plan is written to be version-agnostic and low-conflict. Honor these before and during execution:

> **Integration update (2026-06-10):** the parallel-track foundation work, including the paint and metadata track, has merged to `main` (pull request #48). This branch is rebased onto `origin/main`, and the live `CURRENT_SCHEMA_VERSION` is `8`. The notes below are updated for that reality.

- **Base off `origin/main`.** The parallel-track integration merged to `main` in pull request #48, so this branch (`docs/vernacular-floor-plan-format`) is rebased onto `origin/main` and the schema is generated from the current model. The rebase is conflict-free for the committed docs (they are new files).
- **The version is 8.** Read `CURRENT_SCHEMA_VERSION` from `core/model/factories.ts` (it is `8` on the current base). Throughout this plan, `<version>` means that live integer. `build-schema.mjs` derives it automatically; the fixtures below show `"schemaVersion": 8` (the current live value); always set it to the live `CURRENT_SCHEMA_VERSION`; the `schema/<version>/` and `git add` paths use the live value (`schema/8/`).
- **One shared source file.** The only shared file this plan edits is `core/model/types.ts` (an additive optional `extensions` member on each entity). The paint track has already merged, so the earlier collision caveat no longer applies. Because the multi-floor track landed, `Project` now has a **required** `stairs` member (plus optional `palettes`, `paint`, and `site`), so every fixture MUST include `"stairs": []`, and the `extensions` seam also covers the newly-merged `Stair` and `ProjectPalette` entities defined in `types.ts`. Do NOT touch `core/migrations/` (this plan adds no migration) or any shared config (`eslint.config.js`, `tsconfig*.json`, `.npmrc`).
- **Local only.** The push and PR hold is active: commit on the branch, do not push or open a pull request.
- **Run the cycle from the main (this) thread.** The role-separated red-green-blue subagents (`test-author`, `implementer`, `refactorer`) can only be dispatched from the main thread, so orchestrate each task here. Give each subagent the exact allowed files for its step and tell it to STOP rather than touch anything else. Each cycle is test, then feat, then refactor; close every green with a (possibly empty) refactor marker before the next test.

---

## File structure

- `package.json` (modify): add `ts-json-schema-generator` (dev), `ajv` (runtime), and `schema:generate` + `schema:check` scripts.
- `scripts/schema/build-schema.mjs` (create): pure `buildProjectSchema()` that returns the schema object. One responsibility: turn the types into a schema object.
- `scripts/schema/generate-schema.mjs` (create): write `buildProjectSchema()` output to disk. One responsibility: the write side effect.
- `schema/<version>/vernacular.schema.json` (create, generated): the published CORE schema for the live `schemaVersion`.
- `schema/README.md` (already present): conventions (committed earlier with the spec).
- `core/model/types.ts` (modify): add the optional `extensions` member to each entity.
- `core/format/validate-document.ts` (create): `createDocumentValidator(schema)` over Ajv. One responsibility: compile and run validation.
- `core/format/validate-document.test.ts` (create): unit test with an inline schema.
- `core/format/index.ts` (create): re-export the format module.
- `core/index.ts` (modify): re-export the validator from the public barrel.
- `tests/fixtures/projects/minimal.vernacular.json` (create): the minimal valid Document.
- `tests/fixtures/projects/two-floor-cottage.vernacular.json` (create): a richer multi-floor Document.
- `tests/format/schema-conformance.test.ts` (create): validate fixtures and rejection cases against the committed schema.
- `tests/format/schema-drift.test.ts` (create): the drift guard.

---

## Task 1: Add tooling dependencies and scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the build-time schema generator**

Run: `pnpm add -D ts-json-schema-generator`

The repository pins exact versions (`save-exact=true`) and enforces a 30-day cooldown (`.npmrc` `minimum-release-age=43200`), so pnpm resolves the newest version at least 30 days old and writes an exact pin. If pnpm reports a cooldown conflict from a pre-existing too-new pin, re-run with `pnpm add -D ts-json-schema-generator --config.minimumReleaseAge=0` only when you have confirmed the resolved version is itself older than 30 days.

- [ ] **Step 2: Add the runtime validator**

Run: `pnpm add ajv`

Expected: `ajv` appears under `dependencies` in `package.json` with an exact version, and `pnpm-lock.yaml` updates.

- [ ] **Step 3: Add the scripts**

In `package.json`, add these two entries to `"scripts"` (next to `"test"`):

```json
"schema:generate": "node scripts/schema/generate-schema.mjs",
"schema:check": "node scripts/schema/generate-schema.mjs --check"
```

- [ ] **Step 4: Verify the install**

Run: `pnpm install --frozen-lockfile`
Expected: completes with no changes (lockfile already satisfied).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add schema generation and validation tooling"
```

---

## Task 2: Add the extensions seam to the model

The strict CORE schema rejects unknown properties. To carry third-party data without breaking CORE validation, every entity gains an optional `extensions` map (spec section 6.3). This is additive: existing Documents omit it.

**Files:**

- Modify: `core/model/types.ts`

- [ ] **Step 1: Add a shared extension type and apply it**

At the top of `core/model/types.ts`, after the existing imports, add:

```ts
/**
 * Third-party extension data. Keys are reverse-DNS namespaces (for example
 * "com.example.solar"); values are arbitrary JSON owned by that namespace. The
 * CORE schema validates this as an open object so namespaced data never breaks
 * CORE validation. See docs/specs/2026-06-10-vernacular-floor-plan-format.md,
 * section 6.3.
 */
export type Extensions = Record<string, unknown>
```

Then add `extensions?: Extensions` as the last member of each of these interfaces: `ProjectMeta`, `Wall`, `Opening`, `Underlay`, `Dimension`, `Floor`, `RoomOverride`, and `Project`. For example, in `Project`:

```ts
export interface Project {
  meta: ProjectMeta
  floors: Floor[]
  roomOverrides?: Record<string, RoomOverride> | undefined
  /** Third-party extension data; see {@link Extensions}. */
  extensions?: Extensions
}
```

- [ ] **Step 2: Export the new type from the barrel**

In `core/index.ts`, add `Extensions` to the `export type { ... } from './model/types'` block (keep the list alphabetized: it sits between `Dimension` and `Floor`).

- [ ] **Step 3: Verify types still compile**

Run: `pnpm typecheck`
Expected: no errors. The field is optional, so no existing constructor or fixture breaks.

- [ ] **Step 4: Commit**

```bash
git add core/model/types.ts core/index.ts
git commit -m "feat(core): reserve an optional extensions member on every entity"
```

---

## Task 3: Generate and commit the CORE schema

**Files:**

- Create: `scripts/schema/build-schema.mjs`
- Create: `scripts/schema/generate-schema.mjs`
- Create: `schema/<version>/vernacular.schema.json` (generated)

- [ ] **Step 1: Write the pure schema builder**

Create `scripts/schema/build-schema.mjs`:

```js
import { readFileSync } from 'node:fs'
import { createGenerator } from 'ts-json-schema-generator'

// Track the live format version from the single source of truth so the schema
// follows the model as other integration work bumps it. The integration branch
// is past version 5 (version 7 or later, and a paint track may make it 8); never
// hardcode the version here.
const factoriesSource = readFileSync('core/model/factories.ts', 'utf8')
const versionMatch = factoriesSource.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/)
if (versionMatch === null) {
  throw new Error('Could not read CURRENT_SCHEMA_VERSION from core/model/factories.ts')
}
export const SCHEMA_VERSION = Number(versionMatch[1])
export const SCHEMA_ID = `https://drmrd.github.io/vernacular/schema/${SCHEMA_VERSION}/vernacular.schema.json`

/**
 * Build the CORE JSON Schema for the Vernacular Floor Plan Format from the
 * TypeScript domain types. The types in core/model are the single source of
 * truth; this function projects them into the published artifact.
 */
export function buildProjectSchema() {
  const config = {
    path: 'core/model/types.ts',
    tsconfig: 'tsconfig.json',
    type: 'Project',
    expose: 'export',
    topRef: false,
    jsDoc: 'extended',
    additionalProperties: false,
  }
  const schema = createGenerator(config).createSchema(config.type)
  schema.$id = SCHEMA_ID
  schema.title = 'Vernacular Floor Plan Format Document'
  return schema
}
```

- [ ] **Step 2: Write the generate/check script**

Create `scripts/schema/generate-schema.mjs`:

```js
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildProjectSchema, SCHEMA_VERSION } from './build-schema.mjs'

const OUT = `schema/${SCHEMA_VERSION}/vernacular.schema.json`
const serialized = JSON.stringify(buildProjectSchema(), null, 2) + '\n'

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== serialized) {
    console.error(`Schema drift: ${OUT} is out of date. Run \`pnpm schema:generate\`.`)
    process.exit(1)
  }
  console.log(`${OUT} is up to date.`)
} else {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, serialized)
  console.log(`Wrote ${OUT}`)
}
```

- [ ] **Step 3: Generate the schema**

Run: `pnpm schema:generate`
Expected: prints `Wrote schema/<version>/vernacular.schema.json`.

- [ ] **Step 4: Verify the generated schema's key invariants**

Open `schema/<version>/vernacular.schema.json` and confirm:

- top-level `"additionalProperties": false` and `"required"` includes `"meta"` and `"floors"`;
- `definitions` (or `$defs`) contains `Wall`, `Opening`, `Underlay`, `Dimension`, `Floor`, `ProjectMeta`, `RoomOverride`;
- the `extensions` property exists on the entity definitions and is an open object (`"type": "object"` with no `"additionalProperties": false`);
- `$id` matches the URL in `build-schema.mjs`.

If `ts-json-schema-generator` rendered `extensions` as strict or omitted it, set `expose`/`additionalProperties` as needed and re-run; the invariant that matters is: entities reject unknown keys, but `extensions` accepts any namespaced key.

- [ ] **Step 5: Commit**

```bash
git add scripts/schema/build-schema.mjs scripts/schema/generate-schema.mjs schema/<version>/vernacular.schema.json
git commit -m "feat(format): generate the CORE schema from the model types"
```

---

## Task 4: The document validator

**Files:**

- Create: `core/format/validate-document.ts`
- Create: `core/format/validate-document.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `core/format/validate-document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from './validate-document'

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['meta'],
  properties: {
    meta: { type: 'object' },
    extensions: { type: 'object' },
  },
}

describe('createDocumentValidator', () => {
  it('accepts a document that matches the schema', () => {
    const validate = createDocumentValidator(schema)
    expect(validate({ meta: {} }).valid).toBe(true)
  })

  it('accepts a document carrying an extensions object', () => {
    const validate = createDocumentValidator(schema)
    expect(validate({ meta: {}, extensions: { 'com.example.x': { a: 1 } } }).valid).toBe(true)
  })

  it('rejects a document with an unknown top-level key', () => {
    const validate = createDocumentValidator(schema)
    const result = validate({ meta: {}, bogus: 1 })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects a document missing a required member', () => {
    const validate = createDocumentValidator(schema)
    expect(validate({}).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run core/format/validate-document.test.ts`
Expected: FAIL with a module-not-found error for `./validate-document`.

- [ ] **Step 3: Write the validator**

Create `core/format/validate-document.ts`:

```ts
import Ajv from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'

/** The outcome of validating a Document against a VFPF schema. */
export interface DocumentValidationResult {
  valid: boolean
  errors: ErrorObject[]
}

/** Validates a single Document and reports whether it conforms. */
export type DocumentValidator = (document: unknown) => DocumentValidationResult

/**
 * Compile a reusable validator for Vernacular Floor Plan Format Documents from a
 * generated CORE JSON Schema. The schema is supplied by the caller (the published
 * artifact under schema/<version>/), so core/ stays decoupled from where the file
 * lives. See docs/specs/2026-06-10-vernacular-floor-plan-format.md.
 */
export function createDocumentValidator(schema: object): DocumentValidator {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate: ValidateFunction = ajv.compile(schema)
  return (document: unknown): DocumentValidationResult => {
    const valid = validate(document) === true
    return { valid, errors: valid ? [] : (validate.errors ?? []) }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run core/format/validate-document.test.ts`
Expected: PASS (4 tests). If TypeScript objects to the Ajv default import, use `import { Ajv } from 'ajv'` (Ajv 8 exports both); keep whichever the typecheck accepts.

- [ ] **Step 5: Commit**

```bash
git add core/format/validate-document.ts core/format/validate-document.test.ts
git commit -m "feat(format): add an Ajv document validator"
```

---

## Task 5: Export the validator from the core barrel

**Files:**

- Create: `core/format/index.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Add the format barrel**

Create `core/format/index.ts`:

```ts
export { createDocumentValidator } from './validate-document'
export type { DocumentValidationResult, DocumentValidator } from './validate-document'
```

- [ ] **Step 2: Re-export from the public barrel**

In `core/index.ts`, add at the end of the file:

```ts
export { createDocumentValidator } from './format'
export type { DocumentValidationResult, DocumentValidator } from './format'
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm exec vitest run core/format`
Expected: typecheck passes; the validator test still passes.

- [ ] **Step 4: Commit**

```bash
git add core/format/index.ts core/index.ts
git commit -m "feat(format): export the document validator from core"
```

---

## Task 6: Conformant fixtures and the conformance test

**Files:**

- Create: `tests/fixtures/projects/minimal.vernacular.json`
- Create: `tests/fixtures/projects/two-floor-cottage.vernacular.json`
- Create: `tests/format/schema-conformance.test.ts`

- [ ] **Step 1: Write the failing conformance test**

Create `tests/format/schema-conformance.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from '../../core'
import { SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'

const schemaPath = resolve('schema', String(SCHEMA_VERSION), 'vernacular.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const validate = createDocumentValidator(schema)

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve('tests/fixtures/projects', name), 'utf8'))
}

describe('VFPF schema conformance', () => {
  it('accepts the minimal valid Document', () => {
    expect(validate(fixture('minimal.vernacular.json')).valid).toBe(true)
  })

  it('accepts a richer multi-floor Document', () => {
    expect(validate(fixture('two-floor-cottage.vernacular.json')).valid).toBe(true)
  })

  it('accepts a Document carrying namespaced extensions', () => {
    const doc = fixture('minimal.vernacular.json')
    doc.extensions = { 'com.example.solar': { panelKilowatts: 6.4 } }
    expect(validate(doc).valid).toBe(true)
  })

  it('rejects a Document with an unknown top-level key', () => {
    const doc = fixture('minimal.vernacular.json')
    doc.bogus = true
    expect(validate(doc).valid).toBe(false)
  })

  it('rejects a Document missing required meta', () => {
    expect(validate({ floors: [] }).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/format/schema-conformance.test.ts`
Expected: FAIL, because the fixture files do not exist yet (the `fixture()` reads throw).

- [ ] **Step 3: Write the minimal fixture**

Create `tests/fixtures/projects/minimal.vernacular.json`:

```json
{
  "meta": {
    "name": "Minimal example",
    "units": "imperial",
    "period": "victorian",
    "schemaVersion": 8,
    "appVersion": "0.0.0-fixture",
    "registryVersions": {}
  },
  "floors": [
    {
      "id": "floor-1",
      "name": "Ground Floor",
      "elevation": 0,
      "defaultCeilingHeight": 2438,
      "walls": [],
      "underlays": [],
      "openings": [],
      "dimensions": []
    }
  ],
  "stairs": []
}
```

- [ ] **Step 4: Write the richer fixture**

Create `tests/fixtures/projects/two-floor-cottage.vernacular.json` (a small rectangular room with one door, one dimension, a named room override, and a second floor):

```json
{
  "meta": {
    "name": "Two-floor cottage",
    "units": "imperial",
    "period": "victorian",
    "schemaVersion": 8,
    "appVersion": "0.0.0-fixture",
    "registryVersions": {}
  },
  "floors": [
    {
      "id": "floor-1",
      "name": "Ground Floor",
      "elevation": 0,
      "defaultCeilingHeight": 2438,
      "walls": [
        { "id": "w1", "start": { "x": 0, "y": 0 }, "end": { "x": 4000, "y": 0 }, "thickness": 114 },
        {
          "id": "w2",
          "start": { "x": 4000, "y": 0 },
          "end": { "x": 4000, "y": 3000 },
          "thickness": 114
        },
        {
          "id": "w3",
          "start": { "x": 4000, "y": 3000 },
          "end": { "x": 0, "y": 3000 },
          "thickness": 114
        },
        { "id": "w4", "start": { "x": 0, "y": 3000 }, "end": { "x": 0, "y": 0 }, "thickness": 114 }
      ],
      "openings": [
        {
          "id": "o1",
          "type": "single-swing-door",
          "hostWallId": "w1",
          "position": 2000,
          "width": 813,
          "height": 2032,
          "sillHeight": 0,
          "orientation": { "hinge": "start", "facing": "positive" }
        }
      ],
      "dimensions": [
        { "id": "d1", "start": { "x": 0, "y": 0 }, "end": { "x": 4000, "y": 0 }, "offset": -300 }
      ],
      "underlays": []
    },
    {
      "id": "floor-2",
      "name": "Upper Floor",
      "elevation": 2700,
      "defaultCeilingHeight": 2438,
      "walls": [],
      "openings": [],
      "dimensions": [],
      "underlays": []
    }
  ],
  "stairs": [],
  "roomOverrides": {
    "w1|w2|w3|w4": { "name": "Parlor" }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/format/schema-conformance.test.ts`
Expected: PASS (5 tests). If a fixture fails, read the Ajv errors: a wrong enum value (for example `units`) or a missing required field is the usual cause. Fix the fixture, not the schema.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/projects/minimal.vernacular.json tests/fixtures/projects/two-floor-cottage.vernacular.json tests/format/schema-conformance.test.ts
git commit -m "test(format): add conformant fixtures and the schema conformance test"
```

---

## Task 7: The schema drift guard

The committed schema must never fall behind the types. This test regenerates the schema in-process and compares it to the committed file.

**Files:**

- Create: `tests/format/schema-drift.test.ts`

- [ ] **Step 1: Write the drift test**

Create `tests/format/schema-drift.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProjectSchema, SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'

describe('VFPF schema drift guard', () => {
  it('the committed schema matches the schema generated from the types', () => {
    const committed = readFileSync(
      resolve(`schema/${SCHEMA_VERSION}/vernacular.schema.json`),
      'utf8',
    )
    const regenerated = JSON.stringify(buildProjectSchema(), null, 2) + '\n'
    expect(regenerated).toEqual(committed)
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/format/schema-drift.test.ts`
Expected: PASS. The generator runs in-process; the test may take a few seconds. If Vitest cannot import the `.mjs` script, confirm the test importing `build-schema.mjs` resolves; the file is plain ESM and needs no transform.

- [ ] **Step 3: Prove the guard bites (manual check, then revert)**

Temporarily add a throwaway optional field to `Project` in `core/model/types.ts` (for example `scratch?: number`), run `pnpm exec vitest run tests/format/schema-drift.test.ts`, and confirm it now FAILS (committed schema is stale). Then remove the throwaway field and confirm the test passes again. Do not commit the throwaway field.

- [ ] **Step 4: Commit**

```bash
git add tests/format/schema-drift.test.ts
git commit -m "test(format): guard against schema and type drift"
```

---

## Task 8: Full verification and refactor pass

**Files:**

- None required beyond any clean-up the checks surface.

- [ ] **Step 1: Run the full check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass. Common ESLint snags in this codebase: `max-lines-per-function` (40), `no-magic-numbers`, and `max-lines` (300). The validator and scripts are small, but if `no-magic-numbers` flags the fixture-free constants, hoist them to named constants. Do not weaken the lint config.

- [ ] **Step 2: Confirm the drift script is wired**

Run: `pnpm schema:check`
Expected: prints `schema/<version>/vernacular.schema.json is up to date.` and exits 0. This is the command continuous integration should run to fail builds on drift (wiring it into the CI workflow is a one-line addition tracked with the CI work, not this plan).

- [ ] **Step 3: Close the cycle with a refactor marker**

If the checks surfaced nothing to refactor, record the blue phase explicitly:

```bash
git commit --allow-empty -m "refactor(format): no changes after review"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** This plan implements spec sections 4 (CORE schema), 6.3 (the `extensions` seam, schema side), 8 (generation, validation, drift guard), and 9 (fixtures as conformant Documents). Sections 2.4 (rename), 6.4 (preservation rule round-trip), 7 (migrate-then-validate on load), and the full reserved-namespace and Strict-profile behavior are deferred to plans 2 and 3 as stated above.
- **No silent schema edits:** when a fixture fails validation, the fix is the fixture or the types, never a hand-edit of the generated `schema/<version>/vernacular.schema.json` (the drift guard would catch a hand-edit anyway).
- **Type and name consistency:** `createDocumentValidator`, `DocumentValidationResult`, `DocumentValidator`, `buildProjectSchema`, `SCHEMA_VERSION`, and `SCHEMA_ID` are used identically across tasks 3 through 7.
