# Vernacular Floor Plan Format: Forward-Compatibility Preservation Implementation Plan

> **For agentic workers:** execute task-by-task with the project's role-separated red-green-blue
> cycle (test-author writes the failing `test:`, implementer writes the minimal `feat:`,
> clean-code-reviewer plus refactorer close `refactor:`). Close every GREEN with a BLUE marker
> before the next RED. Keep `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test &&
pnpm build` green and `pnpm rgb:audit origin/main..HEAD` clean each cycle.

**Goal:** Make the floor plan format's forward-compatibility guarantees explicit and enforced: a
defensive codec preservation overlay, a non-fatal validate-after-migration load gate that tolerates
reserved keys, and an optional Strict validation profile for registered vendor extension namespaces.

**Architecture:** Three independent additions, none of which touches `core/model` or the generated
CORE schema (so `pnpm schema:check` stays green and no new dependency is needed). (1) A storage-layer
preservation overlay that, on save, re-grafts any value the prior on-disk Document carried that the
saved Document dropped. (2) A `core/format` tolerant validator plus a non-fatal load gate, wired at
the single app-load seam. (3) A `core/format` Strict profile that validates registered reverse-DNS
extension namespaces against their schemas. See `docs/knowledge/decisions/ADR-0051-...` for the
decision record, and `docs/specs/2026-06-10-vernacular-floor-plan-format.md` sections 6.3, 6.4, 6.5,
7, and 8 for the normative requirements.

**Tech Stack:** TypeScript (strict), Vitest, Ajv 8 (already a dependency), the existing
`DirectoryPort` storage seam and `createDocumentValidator`.

---

## Background the engineer needs

The preservation rule (spec section 6.4) already holds in practice: `migrateProject` deep-clones the
raw document and every migration spreads, `dispatch` mutates the project root in place through a
`Proxy`/`Reflect` (it never reconstructs the root) and command handlers spread entities
(`{ ...wall }`), and `serializeProjectJson` is `JSON.stringify`. So unknown and reserved keys survive
a load-edit-save cycle today. This plan does **not** fix a bug; it adds an explicit, single-owner
**defensive backstop** so the guarantee cannot silently regress (for example if a future loader were
changed to validate-and-strip against the `additionalProperties: false` CORE schema).

Key existing shapes (do not change them):

- `storage/folder/project-json.ts`: `serializeProjectJson(project: Project): Uint8Array` and
  `parseProjectJson(bytes: Uint8Array): unknown`.
- `storage/folder/folder-project-store.ts`: `FolderProjectStore` with `PROJECT_FILE =
'vernacular.json'`, `loadProject()` and `saveProject(project)`. Every wrapper store
  (`OpfsProjectStore`, `FileSystemFolderProjectStore`, `ZipBundleProjectStore`) constructs its own
  `FolderProjectStore`, so wiring the overlay into `saveProject` covers all of them.
- `core/format/validate-document.ts`: `createDocumentValidator(schema: object): DocumentValidator`,
  `DocumentValidator = (document: unknown) => DocumentValidationResult`,
  `DocumentValidationResult = { valid: boolean; errors: ErrorObject[] }` (Ajv `ErrorObject`).
- The committed CORE schema is `schema/8/vernacular.schema.json`; tests load it with
  `readFileSync` and the version from `scripts/schema/build-schema.mjs` (`SCHEMA_VERSION`).
- `core/model/types.ts`: `Extensions = Record<string, unknown>` is an optional member on every
  entity. `Project` has top-level `roomOverrides` and `paint` keyed maps plus `floors`, `stairs`,
  and `palettes` id-arrays.

## File structure

- Create `storage/folder/preserve-unknown.ts` - the pure preservation overlay (`graftUnknown`,
  `preserveUnknown`). One responsibility: re-graft dropped unknown data while honoring deletions.
- Modify `storage/folder/folder-project-store.ts` - `saveProject` applies the overlay using the
  prior on-disk Document.
- Create `core/format/tolerant-validation.ts` - `createTolerantValidator` (CORE validation with
  `additionalProperties` violations filtered out).
- Create `core/format/load-validation-gate.ts` - `createLoadValidationGate` (non-fatal reporting).
- Create `core/format/strict-profile.ts` - `ExtensionSchemaRegistry`, `isReverseDnsNamespace`,
  `createStrictValidator`.
- Modify `core/format/index.ts` and `core/index.ts` - barrel exports for the new `core/format`
  members.
- Modify `bridge/session/load-or-create-project.ts` - run the load gate after `store.load`
  (infrastructure glue).
- Tests live beside each module (`*.test.ts`).

---

## Slice A: Preservation overlay (spec section 6.4)

The overlay is a pure deep-merge of the prior on-disk Document (`previous`) and the freshly produced
Document (`next`). Rules:

- **Entity objects** merge by key union: `next` wins on shared keys; a key present only in
  `previous` is unknown or reserved data the reader dropped, so it is re-grafted.
- **Id-arrays** reconcile by identity: keep exactly `next`'s membership (so deletions are not
  resurrected), and recurse into elements matched by `id` to restore their dropped unknown sub-keys.
  Arrays of id-less values (points, colors) pass through as `next`.
- **Keyed-collection maps** (`roomOverrides`, `paint`) reconcile by key: keep `next`'s keys (so a
  deleted entry is not resurrected) and recurse into entries present in both.

### Task A1: object-level union preservation

**Files:**

- Create: `storage/folder/preserve-unknown.ts`
- Test: `storage/folder/preserve-unknown.test.ts`

- [ ] **Step 1 (RED): write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { graftUnknown } from './preserve-unknown'

describe('graftUnknown object union', () => {
  it('re-grafts a top-level key the next document dropped, keeping next for shared keys', () => {
    const previous = { meta: { name: 'old' }, annotations: { northArrow: { angle: 12 } } }
    const next = { meta: { name: 'new' } }
    expect(graftUnknown(previous, next)).toEqual({
      meta: { name: 'new' },
      annotations: { northArrow: { angle: 12 } },
    })
  })

  it('re-grafts an unknown key nested on a shared entity object', () => {
    const previous = { meta: { name: 'p', trim: { profile: 'ogee' } } }
    const next = { meta: { name: 'p' } }
    expect(graftUnknown(previous, next)).toEqual({ meta: { name: 'p', trim: { profile: 'ogee' } } })
  })

  it('returns next unchanged when no keys were dropped', () => {
    const next = { meta: { name: 'p' }, extensions: { 'com.x.y': { a: 1 } } }
    expect(graftUnknown({ meta: { name: 'p' } }, next)).toEqual(next)
  })
})
```

- [ ] **Step 2: run it, expect failure** - `pnpm exec vitest run storage/folder/preserve-unknown.test.ts` fails (`graftUnknown` not exported).

- [ ] **Step 3 (GREEN): minimal implementation**

```ts
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function graftObject(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    result[key] = key in previous ? graftUnknown(previous[key], next[key]) : next[key]
  }
  for (const key of Object.keys(previous)) {
    // A key the next document lacks is unknown or reserved data the reader dropped; preserve it.
    if (!(key in next)) {
      result[key] = previous[key]
    }
  }
  return result
}

/**
 * Re-graft any value the previous Document carried that the next Document dropped, so a
 * read-modify-write cycle preserves extension payloads and reserved keys a reader does not model
 * (VFPF section 6.4). Shared keys take the next value; previous-only keys are restored.
 */
export function graftUnknown(previous: unknown, next: unknown): unknown {
  if (isPlainObject(previous) && isPlainObject(next)) {
    return graftObject(previous, next)
  }
  return next
}
```

- [ ] **Step 4: run it, expect pass.**

- [ ] **Step 5 (commit RED then GREEN):** test-author commits `test: cover top-level and nested unknown-key preservation`; implementer commits `feat(storage): re-graft dropped unknown keys in the preservation overlay`.

- [ ] **Step 6 (BLUE):** clean-code-review then refactor; land `refactor:` (empty marker if clean).

### Task A2: id-array reconciliation (no resurrection)

**Files:** Modify `storage/folder/preserve-unknown.ts`; Test: same test file.

- [ ] **Step 1 (RED):**

```ts
describe('graftUnknown id-array reconciliation', () => {
  it('restores a dropped unknown sub-key on a surviving entity matched by id', () => {
    const previous = { walls: [{ id: 'w1', thickness: 100, curve: { radius: 50 } }] }
    const next = { walls: [{ id: 'w1', thickness: 120 }] }
    expect(graftUnknown(previous, next)).toEqual({
      walls: [{ id: 'w1', thickness: 120, curve: { radius: 50 } }],
    })
  })

  it('does not resurrect an array element the next document deleted', () => {
    const previous = { walls: [{ id: 'w1' }, { id: 'w2', curve: { r: 1 } }] }
    const next = { walls: [{ id: 'w1' }] }
    expect(graftUnknown(previous, next)).toEqual({ walls: [{ id: 'w1' }] })
  })

  it('passes through arrays of id-less values as next', () => {
    const previous = { customPolygon: [{ x: 0, y: 0 }] }
    const next = { customPolygon: [{ x: 1, y: 1 }] }
    expect(graftUnknown(previous, next)).toEqual({ customPolygon: [{ x: 1, y: 1 }] })
  })
})
```

- [ ] **Step 2: run, expect failure** (arrays currently fall through to `next`, so the first case fails).

- [ ] **Step 3 (GREEN):** add array handling.

```ts
function idOf(value: unknown): string | undefined {
  return isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined
}

function graftArray(previous: readonly unknown[], next: readonly unknown[]): unknown[] {
  return next.map((item) => {
    const id = idOf(item)
    const match =
      id === undefined ? undefined : previous.find((candidate) => idOf(candidate) === id)
    return match === undefined ? item : graftUnknown(match, item)
  })
}
```

Extend `graftUnknown` to dispatch arrays before objects:

```ts
export function graftUnknown(previous: unknown, next: unknown): unknown {
  if (Array.isArray(previous) && Array.isArray(next)) {
    return graftArray(previous, next)
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    return graftObject(previous, next)
  }
  return next
}
```

- [ ] **Step 4: run, expect pass.**
- [ ] **Step 5 commits:** `test: cover id-array preservation and deletion`; `feat(storage): reconcile id-arrays in the preservation overlay`.
- [ ] **Step 6 (BLUE):** review + refactor marker.

### Task A3: keyed-collection maps (no resurrection)

**Files:** Modify `storage/folder/preserve-unknown.ts`; Test: same test file.

- [ ] **Step 1 (RED):**

```ts
describe('graftUnknown keyed-collection maps', () => {
  it('does not resurrect a deleted roomOverrides entry but enriches survivors', () => {
    const previous = {
      roomOverrides: { a: { name: 'A', extra: 1 }, b: { name: 'B' } },
    }
    const next = { roomOverrides: { a: { name: 'A2' } } }
    expect(graftUnknown(previous, next)).toEqual({
      roomOverrides: { a: { name: 'A2', extra: 1 } },
    })
  })

  it('treats paint the same way', () => {
    const previous = { paint: { s1: { color: 'old' }, s2: { color: 'gone' } } }
    const next = { paint: { s1: { color: 'new' } } }
    expect(graftUnknown(previous, next)).toEqual({ paint: { s1: { color: 'new' } } })
  })
})
```

- [ ] **Step 2: run, expect failure** (the deleted `b`/`s2` entry is currently re-grafted by the object-union rule).

- [ ] **Step 3 (GREEN):** add a keyed-collection rule.

```ts
// Top-level members that are keyed collections of modeled entries, not entities. A key absent from
// `next` here is a user deletion, so it must not be re-grafted (unlike an unknown key on an entity).
const KEYED_COLLECTIONS = new Set(['roomOverrides', 'paint'])

function graftKeyedCollection(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    result[key] = key in previous ? graftUnknown(previous[key], next[key]) : next[key]
  }
  return result
}
```

Update `graftObject` to delegate keyed-collection members:

```ts
function graftObject(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(next)) {
    result[key] = graftMember(key, previous, next)
  }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) {
      result[key] = previous[key]
    }
  }
  return result
}

function graftMember(
  key: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): unknown {
  const previousValue = previous[key]
  const nextValue = next[key]
  if (KEYED_COLLECTIONS.has(key) && isPlainObject(previousValue) && isPlainObject(nextValue)) {
    return graftKeyedCollection(previousValue, nextValue)
  }
  return key in previous ? graftUnknown(previousValue, nextValue) : nextValue
}
```

- [ ] **Step 4: run, expect pass.**
- [ ] **Step 5 commits:** `test: cover keyed-collection preservation and deletion`; `feat(storage): reconcile keyed-collection maps in the preservation overlay`.
- [ ] **Step 6 (BLUE):** review + refactor marker (watch `max-lines-per-function` (40) and `max-params` (3); the helpers above are within limits).

### Task A4: apply the overlay on save

**Files:**

- Modify `storage/folder/preserve-unknown.ts` (add `preserveUnknown`)
- Modify `storage/folder/folder-project-store.ts` (`saveProject`)
- Test: `storage/folder/folder-project-store.test.ts`

- [ ] **Step 1 (RED):** add to the store test (uses `InMemoryDirectory`).

```ts
it('preserves unknown and reserved keys across a load-edit-save cycle', async () => {
  const directory = new InMemoryDirectory()
  const document = {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: '0.0.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        elevation: 0,
        defaultCeilingHeight: 2400,
        walls: [],
        openings: [],
        dimensions: [],
        underlays: [],
        trim: { profile: 'ogee' },
      },
    ],
    stairs: [],
    annotations: { northArrow: { angle: 12 } },
  }
  await directory.writeFile(PROJECT_FILE, new TextEncoder().encode(JSON.stringify(document)))
  const store = new FolderProjectStore(directory)
  const loaded = await store.loadProject()
  await store.saveProject({ ...loaded, meta: { ...loaded.meta, name: 'Renamed' } })

  const saved = JSON.parse(new TextDecoder().decode((await directory.readFile(PROJECT_FILE))!))
  expect(saved.annotations).toEqual({ northArrow: { angle: 12 } })
  expect(saved.floors[0].trim).toEqual({ profile: 'ogee' })
  expect(saved.meta.name).toBe('Renamed')
})

it('serializes directly when there is no prior document', async () => {
  const directory = new InMemoryDirectory()
  const store = new FolderProjectStore(directory)
  const project = migrateProject(
    JSON.parse(JSON.stringify(/* a minimal current-version doc */ MINIMAL_DOCUMENT)),
  )
  await store.saveProject(project)
  expect(await directory.readFile(PROJECT_FILE)).toBeDefined()
})
```

(The test-author defines `MINIMAL_DOCUMENT` from the existing fixtures, or reuses a helper already in
the store test; check `tests/fixtures/projects/minimal.vernacular.json`.)

- [ ] **Step 2: run, expect failure** (the dropped-key defensive case fails only if the in-memory
      pipeline drops; to force a genuine RED that exercises the overlay, the test edits via a fresh object
      that omits `annotations`/`trim` at the level the reducer would, so the assertion fails without the
      overlay). The implementer must make both cases pass.

- [ ] **Step 3 (GREEN):** add `preserveUnknown` and call it from `saveProject`.

In `preserve-unknown.ts`:

```ts
import type { Project } from '../../core'

/** Apply the preservation overlay, returning a Document that restores dropped unknown data. */
export function preserveUnknown(previous: unknown, project: Project): Project {
  // The graft only adds keys the typed model omits, so the result is still a Project shape.
  return graftUnknown(previous, project) as Project
}
```

In `folder-project-store.ts` `saveProject`:

```ts
async saveProject(project: Project): Promise<void> {
  // Read the prior Document so the overlay can restore any unknown or reserved data a
  // read-modify-write cycle dropped (VFPF section 6.4). Absent prior file: serialize directly.
  const previousBytes = await this.directory.readFile(PROJECT_FILE)
  const document =
    previousBytes === undefined
      ? project
      : preserveUnknown(parseProjectJson(previousBytes), project)
  await this.directory.writeFile(PROJECT_FILE, serializeProjectJson(document))
}
```

Add the import `import { preserveUnknown } from './preserve-unknown'`.

- [ ] **Step 4: run, expect pass.** Run the full chain.
- [ ] **Step 5 commits:** `test(storage): expect load-edit-save to preserve unknown keys`; `feat(storage): apply the preservation overlay on save`.
- [ ] **Step 6 (BLUE):** review + refactor marker.

---

## Slice B: Validate-after-migration gate (spec sections 7 and 8)

A non-fatal development and safety gate validates the migrated Document against the CORE schema and
**tolerates reserved/unknown keys** (filtering Ajv `additionalProperties` violations) so a reported
issue always means a genuine CORE-shape break. It never rejects a load.

### Task B1: tolerant validator

**Files:**

- Create: `core/format/tolerant-validation.ts`
- Modify: `core/format/index.ts`, `core/index.ts`
- Test: `core/format/tolerant-validation.test.ts`

- [ ] **Step 1 (RED):**

```ts
import { describe, expect, it } from 'vitest'
import { createTolerantValidator } from './tolerant-validation'

const schema = {
  type: 'object',
  properties: { meta: { type: 'object' } },
  required: ['meta'],
  additionalProperties: false,
}

describe('createTolerantValidator', () => {
  it('accepts a document carrying an unknown top-level key', () => {
    const validate = createTolerantValidator(schema)
    expect(validate({ meta: {}, annotations: { x: 1 } }).valid).toBe(true)
  })

  it('still reports a genuine shape break (missing required key)', () => {
    const validate = createTolerantValidator(schema)
    const result = validate({ annotations: {} })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.keyword === 'required')).toBe(true)
  })
})
```

- [ ] **Step 2: run, expect failure.**

- [ ] **Step 3 (GREEN):**

```ts
import type { DocumentValidationResult, DocumentValidator } from './validate-document'
import { createDocumentValidator } from './validate-document'

/**
 * A CORE validator that tolerates unknown and reserved keys: it drops Ajv `additionalProperties`
 * violations so a reported error always signals a genuine CORE-shape break (wrong type, missing
 * required field). Used as the non-fatal load gate (VFPF sections 6.4, 7, 8). Reserved keys and
 * extension payloads are preserved by design, so they must not surface as gate issues.
 */
export function createTolerantValidator(schema: object): DocumentValidator {
  const validate = createDocumentValidator(schema)
  return (document: unknown): DocumentValidationResult => {
    const { errors } = validate(document)
    const shapeErrors = errors.filter((error) => error.keyword !== 'additionalProperties')
    return { valid: shapeErrors.length === 0, errors: shapeErrors }
  }
}
```

Export it from `core/format/index.ts` (`export { createTolerantValidator } from './tolerant-validation'`)
and re-export from `core/index.ts` beside `createDocumentValidator`.

- [ ] **Step 4: run, expect pass.**
- [ ] **Step 5 commits:** `test: tolerate reserved keys in the load validator`; `feat(core): add a reserved-key-tolerant document validator`.
- [ ] **Step 6 (BLUE):** review + refactor marker. Update `core/format/barrel.test.ts` if it asserts the export set (the test-author owns that test).

### Task B2: non-fatal load gate

**Files:**

- Create: `core/format/load-validation-gate.ts`
- Modify: `core/format/index.ts`, `core/index.ts`
- Test: `core/format/load-validation-gate.test.ts`

- [ ] **Step 1 (RED):**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createLoadValidationGate } from './load-validation-gate'

describe('createLoadValidationGate', () => {
  it('reports issues without throwing when the document is invalid', () => {
    const report = vi.fn()
    const gate = createLoadValidationGate({
      validate: () => ({ valid: false, errors: [{ keyword: 'required' } as never] }),
      report,
    })
    expect(() => gate({ any: 'thing' })).not.toThrow()
    expect(report).toHaveBeenCalledOnce()
  })

  it('reports nothing when the document is valid', () => {
    const report = vi.fn()
    const gate = createLoadValidationGate({ validate: () => ({ valid: true, errors: [] }), report })
    gate({})
    expect(report).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: run, expect failure.**

- [ ] **Step 3 (GREEN):**

```ts
import type { ErrorObject } from 'ajv'
import type { DocumentValidator } from './validate-document'

/** Receives the CORE-shape errors a load gate found; never invoked for a conformant document. */
export type DocumentIssueReporter = (errors: ErrorObject[]) => void

export interface LoadValidationGateOptions {
  validate: DocumentValidator
  report: DocumentIssueReporter
}

/**
 * Build a non-fatal load gate: it validates an already-migrated Document and reports any CORE-shape
 * issues, but never throws, because migration (not validation) is the user-facing compatibility path
 * (VFPF section 8). Reserved keys are tolerated upstream by the validator.
 */
export function createLoadValidationGate(
  options: LoadValidationGateOptions,
): (document: unknown) => void {
  return (document: unknown): void => {
    const result = options.validate(document)
    if (!result.valid) {
      options.report(result.errors)
    }
  }
}
```

Export from `core/format/index.ts` and `core/index.ts` (also export the
`DocumentIssueReporter` type).

- [ ] **Step 4: run, expect pass.**
- [ ] **Step 5 commits:** `test: report load validation issues non-fatally`; `feat(core): add a non-fatal load validation gate`.
- [ ] **Step 6 (BLUE):** review + refactor marker.

### Task B3: wire the gate at the app-load seam (infrastructure)

**Files:** Modify `bridge/session/load-or-create-project.ts` (and the minimal composition that supplies
the schema). This is glue: commit as `build:` carrying an `Infrastructure:` trailer so the rgb audit
exempts it.

- [ ] **Step 1:** read the committed schema once at composition and build the gate:

```ts
import { createLoadValidationGate, createTolerantValidator } from '../../core'
// schema is provided by the composition root that already knows schema/<version>/vernacular.schema.json
```

After a successful `store.load(projectId)`, call the gate on the returned project and report via
`console.warn` (development signal only). Keep it side-effecting and non-fatal; never block the load.
If threading the schema to this seam proves to require touching multiple wrapper stores, instead wire
the gate at the single composition site that constructs the app's store, and leave the wrappers
untouched.

- [ ] **Step 2:** run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; confirm green.
- [ ] **Step 3 (commit):**

```bash
git add bridge/session/load-or-create-project.ts
git commit -m "build: run the tolerant load validator after migration on app load

Infrastructure: non-fatal dev/safety gate wiring, not a behavior cycle"
```

---

## Slice C: Strict validation profile (spec sections 6.3 and 6.5)

The Strict profile validates the CORE schema and, additionally, validates each entity's `extensions`
payloads whose reverse-DNS namespace is registered, against that namespace's published schema.
Unregistered namespaces pass (the format is open). Malformed reverse-DNS namespace keys are reported.

### Task C1: registered-namespace payload validation

**Files:**

- Create: `core/format/strict-profile.ts`
- Modify: `core/format/index.ts`, `core/index.ts`
- Test: `core/format/strict-profile.test.ts`

- [ ] **Step 1 (RED):**

```ts
import { describe, expect, it } from 'vitest'
import { createStrictValidator, type ExtensionSchemaRegistry } from './strict-profile'

const coreSchema = {
  type: 'object',
  properties: { meta: { type: 'object' }, extensions: { type: 'object' } },
  required: ['meta'],
  additionalProperties: true,
}
const registry: ExtensionSchemaRegistry = new Map([
  [
    'com.example.solar',
    { type: 'object', properties: { kw: { type: 'number' } }, required: ['kw'] },
  ],
])

describe('createStrictValidator registered namespaces', () => {
  it('accepts a conforming registered namespace payload', () => {
    const validate = createStrictValidator(coreSchema, registry)
    expect(validate({ meta: {}, extensions: { 'com.example.solar': { kw: 6 } } }).valid).toBe(true)
  })

  it('rejects a registered namespace payload that violates its schema', () => {
    const validate = createStrictValidator(coreSchema, registry)
    expect(validate({ meta: {}, extensions: { 'com.example.solar': { kw: 'lots' } } }).valid).toBe(
      false,
    )
  })

  it('accepts an unregistered namespace payload (open format)', () => {
    const validate = createStrictValidator(coreSchema, registry)
    expect(
      validate({ meta: {}, extensions: { 'org.other.thing': { whatever: true } } }).valid,
    ).toBe(true)
  })
})
```

- [ ] **Step 2: run, expect failure.**

- [ ] **Step 3 (GREEN):** implement with a lazily-compiled per-namespace validator cache.

```ts
import Ajv from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import type { DocumentValidationResult, DocumentValidator } from './validate-document'
import { createDocumentValidator } from './validate-document'

/** Maps a reverse-DNS extension namespace to the JSON Schema that validates its payloads. */
export type ExtensionSchemaRegistry = Map<string, object>

function compile(registry: ExtensionSchemaRegistry): Map<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const compiled = new Map<string, ValidateFunction>()
  for (const [namespace, schema] of registry) {
    compiled.set(namespace, ajv.compile(schema))
  }
  return compiled
}

function validateExtensions(
  extensions: Record<string, unknown>,
  compiled: Map<string, ValidateFunction>,
): ErrorObject[] {
  const errors: ErrorObject[] = []
  for (const [namespace, payload] of Object.entries(extensions)) {
    const validate = compiled.get(namespace)
    if (validate !== undefined && validate(payload) !== true) {
      errors.push(...(validate.errors ?? []))
    }
  }
  return errors
}
```

Add a deep walk that collects every `extensions` object in the document, then combine CORE errors
with extension errors:

```ts
function collectExtensions(node: unknown, found: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectExtensions(item, found)
    return
  }
  if (typeof node !== 'object' || node === null) return
  const record = node as Record<string, unknown>
  const extensions = record.extensions
  if (typeof extensions === 'object' && extensions !== null && !Array.isArray(extensions)) {
    found.push(extensions as Record<string, unknown>)
  }
  for (const value of Object.values(record)) collectExtensions(value, found)
}

/**
 * The Strict profile (VFPF section 3): CORE validation plus per-namespace validation of registered
 * reverse-DNS extension namespaces against their published schemas. Unregistered namespaces pass.
 */
export function createStrictValidator(
  coreSchema: object,
  registry: ExtensionSchemaRegistry,
): DocumentValidator {
  const core = createDocumentValidator(coreSchema)
  const compiled = compile(registry)
  return (document: unknown): DocumentValidationResult => {
    const coreResult = core(document)
    const found: Record<string, unknown>[] = []
    collectExtensions(document, found)
    const extensionErrors = found.flatMap((extensions) => validateExtensions(extensions, compiled))
    const errors = [...coreResult.errors, ...extensionErrors]
    return { valid: errors.length === 0, errors }
  }
}
```

Export `createStrictValidator` and `ExtensionSchemaRegistry` from `core/format/index.ts` and
`core/index.ts`.

- [ ] **Step 4: run, expect pass.**
- [ ] **Step 5 commits:** `test: validate registered extension namespaces in the strict profile`; `feat(core): add the strict validation profile for registered namespaces`.
- [ ] **Step 6 (BLUE):** review + refactor marker. Watch `max-lines-per-function` (split `collectExtensions`/`compile` as shown).

### Task C2: Strict validation reaches nested entity extensions

**Files:** Test only addition in `core/format/strict-profile.test.ts` (the deep walk from C1 already
covers nesting; this task proves it and guards against regression).

- [ ] **Step 1 (RED):** if C1's walk already handles nesting, write the test so it fails first by being
      authored before C1 is merged; if C1 already merged, this is a guard test - fold it into C1's RED so
      the cycle stays test-before-feat. Recommended: include this case in C1's RED instead of a separate
      cycle.

```ts
it('validates a registered namespace on a nested entity (a wall)', () => {
  const validate = createStrictValidator(coreSchema, registry)
  const document = {
    meta: {},
    floors: [
      { id: 'f1', walls: [{ id: 'w1', extensions: { 'com.example.solar': { kw: 'no' } } }] },
    ],
  }
  expect(validate(document).valid).toBe(false)
})
```

> Note: prefer adding this assertion to Task C1's RED test so there is no GREEN without a failing
> test. Keep C2 only if a separate behavior (for example caching) emerges; otherwise drop it.

### Task C3: malformed reverse-DNS namespace keys are reported

**Files:**

- Modify: `core/format/strict-profile.ts` (add `isReverseDnsNamespace`, use it in `validateExtensions`)
- Modify: `core/format/index.ts`, `core/index.ts` (export `isReverseDnsNamespace`)
- Test: `core/format/strict-profile.test.ts`

- [ ] **Step 1 (RED):**

```ts
import { createStrictValidator, isReverseDnsNamespace } from './strict-profile'

describe('reverse-DNS namespace keys', () => {
  it('accepts a well-formed reverse-DNS key', () => {
    expect(isReverseDnsNamespace('com.example.solar')).toBe(true)
  })

  it('rejects a key without a dot', () => {
    expect(isReverseDnsNamespace('solar')).toBe(false)
  })

  it('reports a malformed namespace key under the strict profile', () => {
    const validate = createStrictValidator(coreSchema, new Map())
    expect(validate({ meta: {}, extensions: { solar: { kw: 6 } } }).valid).toBe(false)
  })
})
```

- [ ] **Step 2: run, expect failure.**

- [ ] **Step 3 (GREEN):**

```ts
const REVERSE_DNS = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

/** A reverse-DNS extension namespace has at least two dot-separated labels (VFPF section 6.3). */
export function isReverseDnsNamespace(key: string): boolean {
  return REVERSE_DNS.test(key)
}
```

In `validateExtensions`, before the registry lookup, push a synthetic error for a malformed key:

```ts
for (const [namespace, payload] of Object.entries(extensions)) {
  if (!isReverseDnsNamespace(namespace)) {
    errors.push({
      keyword: 'reverseDns',
      instancePath: `/extensions/${namespace}`,
      schemaPath: '#/extensions',
      params: { namespace },
      message: 'extension namespace must be reverse-DNS',
    } as ErrorObject)
    continue
  }
  const validate = compiled.get(namespace)
  if (validate !== undefined && validate(payload) !== true) {
    errors.push(...(validate.errors ?? []))
  }
}
```

- [ ] **Step 4: run, expect pass.**
- [ ] **Step 5 commits:** `test: reject malformed reverse-DNS namespaces in the strict profile`; `feat(core): flag malformed reverse-DNS extension namespaces`.
- [ ] **Step 6 (BLUE):** review + refactor marker.

---

## Knowledge curation and finalization

- [ ] Add ADR-0051 (`docs/knowledge/decisions/ADR-0051-format-preservation-and-load-validation.md`)
      recording the three decisions; refresh ADR-0047's status note to mark preservation and
      validate-after-migration as landed. Commit as `docs:` (these can be the branch's opening commits,
      with the plan doc committed first).
- [ ] Run `pnpm knowledge:index` locally (the index stays gitignored).
- [ ] PR-level review with the pr-reviewer; verify the rgb audit is clean over `origin/main..HEAD`.

## Self-review (spec coverage)

- Section 6.3 (vendor extensions) and 6.5 (registered namespace schemas): Slice C.
- Section 6.4 (preservation rule): Slice A, with deletion correctness (id-arrays and keyed maps).
- Section 7 (reading rules) and 8 (validation as a non-fatal load gate): Slice B; forward-version
  (M > N) documents remain refused by `migrateProject`, which section 7 permits.
- No `core/model` or CORE schema change, so the drift guard (section 8) stays green with no
  regeneration, and no new dependency is introduced.
  </content>
