# Core and Storage Layer Skeleton: Domain Model, Registries, and Storage Interfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the two bottom layers of the six-layer architecture as real, unit-tested TypeScript: the pure `core/` domain (project model, content-addressed asset references, the registry pattern with two seeded registries) and the `storage/` provider interfaces with an in-memory reference store. Along the way, repair and lock down layer-boundary enforcement, which is currently configured but non-functional.

**Architecture:** `core/` is pure TypeScript with zero React, Three.js, or DOM dependencies (ADR-0001); it is fully testable in Node. `storage/` depends only on `core/` and declares the `ProjectStore`, `LibraryStore`, and `AssetCache` provider interfaces, with a `Map`-backed `InMemoryProjectStore` as the first concrete implementation (real filesystem, OPFS, and zip stores land in a later storage-scaffolds plan). Both layers live at the repository root (`core/`, `storage/`), matching the `eslint-plugin-boundaries` element map and the repository layout in `CLAUDE.md`. A committed architecture-fitness test runs ESLint programmatically to prove an illegal cross-layer import is rejected, so the boundary guard can never silently regress again.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest for unit tests, `eslint-plugin-boundaries` v6 for layer enforcement. No new dependencies: the boundary repair relies on `eslint-import-resolver-node`, which is already present transitively.

**Scope boundary:** This plan is the first of three that together deliver the full six-layer source skeleton. It does NOT add the command dispatcher, the `InverseCapture` proxy, the undo/redo history, or the scene-graph derivation; those are the behavioral core and belong to the next plan (`command-dispatch-and-scene-graph`). It does NOT create the `engine/`, `bridge/`, `editor/`, or `app/` layers, the Three.js + React-Three-Fiber + WebGPU renderer skeleton, the dispatch boundary, or the React app shell; those belong to the third plan (`render-and-app-skeleton`). It does NOT add concrete filesystem, OPFS, or zip storage implementations (a later storage-scaffolds plan), nor any wall entity or wall-drawing tool (the proof-of-life plan), nor units or color science (`core/units/`, `core/color/` arrive with the 2D editor work). It does NOT modify `docs/specs/`.

---

## Background: the layer-boundary enforcement defect

The ESLint config in `eslint.config.js` was written during the lint-guardrails work to enforce the six-layer dependency direction, but it has never been exercised against real files in the layer directories (none existed until now). Hands-on verification during planning found three problems that together make the rule a no-op:

1. **Element patterns match one level too deep.** `pattern: 'core/*'` (folder mode) matches `core/<subdir>/...` but not files directly under `core/` (for example `core/index.ts`), so many files are classified as "unknown" and escape the rule entirely.
2. **No import resolver is configured.** Without a resolver that understands `.ts`, the plugin cannot resolve a cross-layer import such as `../storage/project-store` to a file, so it cannot classify the dependency's layer and silently skips it. `eslint-import-resolver-node@0.3.9` is already installed transitively; it only needs to be referenced with TypeScript extensions.
3. **The rule name and selector syntax are deprecated.** `eslint-plugin-boundaries` v6 renamed `boundaries/element-types` to `boundaries/dependencies` and replaced array selectors (`from: ['core']`) with object selectors (`from: { type: 'core' }`). The legacy form still loads but emits deprecation notices and is slated for removal.

The combined, verified fix (Task 3) changes element patterns to `core/**`, migrates the rules to object selectors under `boundaries/dependencies`, and adds `'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] } }`. After the fix, an illegal `core -> storage` import is reported as a `boundaries/dependencies` error and legal imports stay clean. The architecture-fitness test in Task 3 encodes this guarantee.

---

## File structure

| File                                          | Purpose                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `core/README.md`                              | One-paragraph boundary statement for the pure-TS domain layer                              |
| `core/index.ts`                               | Public barrel for `core/`; the only entry other layers import                              |
| `core/model/types.ts`                         | `Project`, `ProjectMeta`, `Floor`, `UnitSystem`, `EraId`, `SchemaVersion`                  |
| `core/model/factories.ts`                     | `createEmptyProject`, `createFloor`, `CURRENT_SCHEMA_VERSION`, `DEFAULT_CEILING_HEIGHT_MM` |
| `core/model/factories.test.ts`                | Unit tests for the model factories                                                         |
| `core/model/asset-reference.ts`               | `AssetReference` (content-addressed), `formatAssetReference`, `parseAssetReference`        |
| `core/model/asset-reference.test.ts`          | Unit tests for asset-reference formatting and parsing                                      |
| `core/registries/registry.ts`                 | Generic `Registry<T>`, `createRegistry`, `getEntry`, `mergeRegistries`                     |
| `core/registries/registry.test.ts`            | Unit tests for the registry pattern                                                        |
| `core/registries/finishes.ts`                 | `Finish` type and the seeded `builtinFinishes` registry                                    |
| `core/registries/finishes.test.ts`            | Unit tests for the finish registry                                                         |
| `core/registries/element-types.ts`            | `ElementType` type and the seeded `builtinElementTypes` registry                           |
| `core/registries/element-types.test.ts`       | Unit tests for the element-type registry                                                   |
| `storage/README.md`                           | One-paragraph boundary statement for the storage-provider layer                            |
| `storage/index.ts`                            | Public barrel for `storage/`                                                               |
| `storage/project-store.ts`                    | `ProjectStore`, `ProjectSummary` interfaces                                                |
| `storage/library-store.ts`                    | `LibraryStore`, `LibraryItemSummary` interfaces                                            |
| `storage/asset-cache.ts`                      | `AssetCache` interface                                                                     |
| `storage/in-memory-project-store.ts`          | `InMemoryProjectStore` reference implementation                                            |
| `storage/in-memory-project-store.test.ts`     | Unit tests for the in-memory store                                                         |
| `tests/architecture/layer-boundaries.test.ts` | Architecture-fitness test: proves the boundary rule rejects illegal imports                |
| `eslint.config.js`                            | Repair boundary enforcement; add a `no-magic-numbers` exemption for registry data          |
| `tsconfig.json`                               | Add `core` and `storage` to `include`                                                      |
| `vite.config.ts`                              | Add `core/**` and `storage/**` to coverage `include`; broaden the test exclude             |
| `ROADMAP.md`                                  | Correct the stale Lighthouse row; mark the source skeleton in progress                     |
| `docs/knowledge/` (local, gitignored)         | Refresh ADR-0001 and record the boundary-enforcement repair                                |
| `.superpowers/scratch/progress.md` (local)    | Capture merge SHA and prep notes for the next plan                                         |

---

## Tasks

### Task 1: Branch, clean tree, and remove the stray Vite config

**Files:** none committed (pre-flight + local cleanup).

- [ ] **Step 1: Confirm the working directory, branch, and clean tree**

```
pwd
git branch --show-current
git status --short
```

Expected: directory is `/Users/dan/workspace/vernacular`. If the branch is not `feat/core-domain-and-registries`, create it from an up-to-date `main`:

```
git checkout main && git pull
git checkout -b feat/core-domain-and-registries
```

Working tree must be clean. If anything differs, STOP and report BLOCKED with what was found.

- [ ] **Step 2: Remove the stray, gitignored `vite.config.js`**

`tsc -b` emits `vite.config.js` from the composite `tsconfig.node.json`. It is gitignored, but Vite's config resolution prefers `vite.config.js` over `vite.config.ts`, so a stale copy can shadow edits to the TypeScript config during local runs. Remove it so local `vite` picks up the edited `vite.config.ts`; `pnpm build` will regenerate the gitignored copy.

```
rm -f vite.config.js vite.config.d.ts
git status --short
```

Expected: `git status` stays clean (the removed files were gitignored). No commit.

---

### Task 2: Scaffold the `core/` and `storage/` layers and wire the build

This task creates the layer directories with their public barrels and boundary READMEs, then teaches `tsconfig` and Vitest coverage about them. The barrels start empty and are filled by later tasks. Creating the directories first lets Task 3's fitness test resolve `../core` and `../storage`.

**Files:**

- Create: `core/README.md`, `core/index.ts`, `storage/README.md`, `storage/index.ts`
- Modify: `tsconfig.json`, `vite.config.ts`

- [ ] **Step 1: Create the `core/` boundary README**

`core/README.md`:

```markdown
# core/

The pure-TypeScript domain layer. No React, no Three.js, no DOM. Everything here is
testable in plain Node. Other layers depend on `core/`; `core/` depends on nothing
above it. See ADR-0001 and the design specification, section 2.
```

- [ ] **Step 2: Create the empty `core/` barrel**

`core/index.ts`:

```typescript
export {}
```

- [ ] **Step 3: Create the `storage/` boundary README**

`storage/README.md`:

```markdown
# storage/

Project, library, and asset persistence. Provider-shaped from day one: `ProjectStore`,
`LibraryStore`, and `AssetCache` are interfaces with multiple implementations. This layer
depends only on `core/`. Browser storage APIs are used only inside this layer. See ADR-0001
and the design specification, section 5.
```

- [ ] **Step 4: Create the empty `storage/` barrel**

`storage/index.ts`:

```typescript
export {}
```

- [ ] **Step 5: Add the new layers to `tsconfig.json`**

Change the `include` array:

```jsonc
  "include": ["src", "tests", "core", "storage"],
```

- [ ] **Step 6: Extend Vitest coverage in `vite.config.ts`**

Replace the `coverage.include` and `coverage.exclude` arrays:

```typescript
      include: ['src/**/*.{ts,tsx}', 'core/**/*.{ts,tsx}', 'storage/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'src/main.tsx', 'src/setupTests.ts'],
```

- [ ] **Step 7: Verify the scaffold typechecks, lints, and builds**

```
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all pass. The empty barrels are valid modules; the new directories typecheck cleanly.

- [ ] **Step 8: Commit**

```
git add core/ storage/ tsconfig.json vite.config.ts
git commit -m "chore: scaffold core and storage layers and wire the build"
```

---

### Task 3: Repair and lock down layer-boundary enforcement

Red-green-blue. The fitness test is the failing test; the ESLint config repair is the implementation. The test runs ESLint programmatically against a virtual file path so it never needs an always-failing fixture committed to the tree.

**Files:**

- Create: `tests/architecture/layer-boundaries.test.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Write the failing fitness test**

`tests/architecture/layer-boundaries.test.ts`:

```typescript
// @vitest-environment node
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

async function ruleIdsFor(code: string, filePath: string): Promise<(string | null)[]> {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map((message) => message.ruleId) ?? []
}

describe('layer boundary enforcement', () => {
  it('rejects a core module importing storage', async () => {
    const ids = await ruleIdsFor(
      "import type { ProjectStore } from '../storage'\nexport type Forbidden = ProjectStore\n",
      'core/boundary-sample.ts',
    )
    expect(ids).toContain('boundaries/dependencies')
  })

  it('allows a storage module importing core', async () => {
    const ids = await ruleIdsFor(
      "import type { Project } from '../core'\nexport type Allowed = Project\n",
      'storage/boundary-sample.ts',
    )
    expect(ids).not.toContain('boundaries/dependencies')
  })
})
```

The file paths are one level under each layer, so the relative imports resolve to the sibling layer at the repository root. The files need not exist on disk; `lintText` lints the provided text and uses the path only for config and element matching.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- layer-boundaries`
Expected: the "rejects a core module importing storage" case FAILS because the current config does not flag the illegal import (the rule is a no-op). The "allows" case passes.

- [ ] **Step 3: Fix the element patterns in `eslint.config.js`**

Replace the `layerElements` array (match one level too deep is the bug; `**` matches the layer root and any depth):

```javascript
const layerElements = [
  { type: 'core', pattern: 'core/**' },
  { type: 'storage', pattern: 'storage/**' },
  { type: 'engine', pattern: 'engine/**' },
  { type: 'bridge', pattern: 'bridge/**' },
  { type: 'editor', pattern: 'editor/**' },
  { type: 'app', pattern: 'app/**' },
]
```

- [ ] **Step 4: Migrate the rules to v6 object selectors in `eslint.config.js`**

Replace the `layerRules` array:

```javascript
const layerRules = [
  { from: { type: 'core' }, disallow: { to: { type: '*' } } },
  { from: { type: 'storage' }, allow: { to: { type: 'core' } } },
  { from: { type: 'engine' }, allow: { to: { type: ['core', 'storage'] } } },
  { from: { type: 'bridge' }, allow: { to: { type: ['core', 'storage', 'engine'] } } },
  { from: { type: 'editor' }, allow: { to: { type: ['core', 'storage', 'engine', 'bridge'] } } },
  {
    from: { type: 'app' },
    allow: { to: { type: ['core', 'storage', 'engine', 'bridge', 'editor'] } },
  },
]
```

- [ ] **Step 5: Add the import resolver to the `settings` block in `eslint.config.js`**

Insert the resolver line into `settings`, just after `'boundaries/elements': layerElements,`:

```javascript
    settings: {
      'boundaries/elements': layerElements,
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] } },
      'boundaries/include': [
```

- [ ] **Step 6: Rename the rule in the `rules` block of `eslint.config.js`**

Replace the boundaries rule line:

```javascript
      // Layer boundaries
      'boundaries/dependencies': ['error', { default: 'disallow', rules: layerRules }],
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `pnpm test -- layer-boundaries`
Expected: both cases PASS. The illegal import now reports `boundaries/dependencies`; the legal import stays clean.

- [ ] **Step 8: Confirm the whole repository still lints clean**

```
pnpm lint
```

Expected: exit 0, zero findings. The existing `src/` files are unaffected (they are outside `boundaries/include`), and no deprecation notices are printed.

- [ ] **Step 9: Commit the test and the fix as two commits**

```
git add tests/architecture/layer-boundaries.test.ts
git commit -m "test: assert layer-boundary enforcement rejects illegal imports"
git add eslint.config.js
git commit -m "fix: make layer-boundary enforcement actually fire"
```

- [ ] **Step 10: Blue phase**

Review the test and config against the Clean Code rubric. The helper and config are already small and intent-revealing. Land the marker commit:

```
git commit --allow-empty -m "refactor: layer-boundary enforcement clean-code pass"
```

---

### Task 4: Core project model and factories

Red-green-blue. Types alone have no runtime behavior, so the failing test targets the factories, which exercise the types.

**Files:**

- Create: `core/model/types.ts`, `core/model/factories.ts`, `core/model/factories.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/model/factories.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  createEmptyProject,
  createFloor,
} from './factories'

describe('createEmptyProject', () => {
  it('creates a project with no floors and the current schema version', () => {
    const project = createEmptyProject({
      name: 'Test House',
      units: 'imperial',
      era: 'victorian',
      appVersion: '0.1.0',
    })

    expect(project.floors).toEqual([])
    expect(project.meta.name).toBe('Test House')
    expect(project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(project.meta.registryVersions).toEqual({})
  })
})

describe('createFloor', () => {
  it('uses the supplied id and defaults the ceiling height and elevation', () => {
    const floor = createFloor('Ground', { id: 'floor-1' })

    expect(floor.id).toBe('floor-1')
    expect(floor.elevation).toBe(0)
    expect(floor.defaultCeilingHeight).toBe(DEFAULT_CEILING_HEIGHT_MM)
  })

  it('generates a unique id when none is supplied', () => {
    expect(createFloor('A').id).not.toBe(createFloor('B').id)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- factories`
Expected: FAIL, cannot resolve `./factories`.

- [ ] **Step 3: Write the model types**

`core/model/types.ts`:

```typescript
export type UnitSystem = 'imperial' | 'metric'

/** References an entry in the EraRegistry. */
export type EraId = string

/** Monotonically increasing project-schema version; drives the migration chain. */
export type SchemaVersion = number

export interface ProjectMeta {
  name: string
  units: UnitSystem
  era: EraId
  schemaVersion: SchemaVersion
  appVersion: string
  registryVersions: Record<string, number>
}

export interface Floor {
  id: string
  name: string
  /** Elevation of the finished floor surface, in millimeters. */
  elevation: number
  /** Default ceiling height for rooms on this floor, in millimeters. */
  defaultCeilingHeight: number
}

export interface Project {
  meta: ProjectMeta
  floors: Floor[]
}
```

- [ ] **Step 4: Write the factories**

`core/model/factories.ts`:

```typescript
import type { EraId, Floor, Project, UnitSystem } from './types'

export const CURRENT_SCHEMA_VERSION = 1

/** MVP default ceiling height: eight feet, expressed in millimeters. */
export const DEFAULT_CEILING_HEIGHT_MM = 2438

export interface NewProjectOptions {
  name: string
  units: UnitSystem
  era: EraId
  appVersion: string
}

export function createEmptyProject(options: NewProjectOptions): Project {
  return {
    meta: {
      name: options.name,
      units: options.units,
      era: options.era,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: options.appVersion,
      registryVersions: {},
    },
    floors: [],
  }
}

export interface NewFloorOptions {
  id?: string
  elevation?: number
  defaultCeilingHeight?: number
}

export function createFloor(name: string, options: NewFloorOptions = {}): Floor {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name,
    elevation: options.elevation ?? 0,
    defaultCeilingHeight: options.defaultCeilingHeight ?? DEFAULT_CEILING_HEIGHT_MM,
  }
}
```

- [ ] **Step 5: Export from the barrel**

Replace `core/index.ts` contents:

```typescript
export type { EraId, Floor, Project, ProjectMeta, SchemaVersion, UnitSystem } from './model/types'
export type { NewFloorOptions, NewProjectOptions } from './model/factories'
export {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  createEmptyProject,
  createFloor,
} from './model/factories'
```

- [ ] **Step 6: Run the test and the chain**

Run: `pnpm test -- factories && pnpm typecheck && pnpm lint`
Expected: tests PASS; typecheck and lint clean.

- [ ] **Step 7: Commit (test, then implementation), then blue marker**

```
git add core/model/factories.test.ts
git commit -m "test: cover the project and floor factories"
git add core/model/types.ts core/model/factories.ts core/index.ts
git commit -m "feat: add the core project model and factories"
git commit --allow-empty -m "refactor: core model clean-code pass"
```

---

### Task 5: Content-addressed asset references

Red-green-blue. Satisfies the content-addressing invariant (ADR-0007) at the model level.

**Files:**

- Create: `core/model/asset-reference.ts`, `core/model/asset-reference.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/model/asset-reference.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatAssetReference, parseAssetReference, type AssetReference } from './asset-reference'

describe('asset references', () => {
  it('round-trips a pack-scoped reference', () => {
    const reference: AssetReference = { scope: 'pack:victorian@1.2.0', contentHash: 'abc123' }
    expect(parseAssetReference(formatAssetReference(reference))).toEqual(reference)
  })

  it('round-trips user and project scopes', () => {
    for (const scope of ['user', 'project'] as const) {
      const reference: AssetReference = { scope, contentHash: 'deadbeef' }
      expect(parseAssetReference(formatAssetReference(reference))).toEqual(reference)
    }
  })

  it('throws on a malformed serialized reference', () => {
    expect(() => parseAssetReference('no-separator-here')).toThrow('Malformed asset reference')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- asset-reference`
Expected: FAIL, cannot resolve `./asset-reference`.

- [ ] **Step 3: Write the implementation**

`core/model/asset-reference.ts`:

```typescript
export type AssetScope = `pack:${string}@${string}` | 'user' | 'project'

/** Content-addressed reference to an external asset. See ADR-0007. */
export interface AssetReference {
  scope: AssetScope
  contentHash: string
}

const SCOPE_SEPARATOR = '#'

export function formatAssetReference(reference: AssetReference): string {
  return `${reference.scope}${SCOPE_SEPARATOR}${reference.contentHash}`
}

export function parseAssetReference(serialized: string): AssetReference {
  const separatorIndex = serialized.indexOf(SCOPE_SEPARATOR)
  if (separatorIndex === -1) {
    throw new Error(`Malformed asset reference: "${serialized}"`)
  }

  // The scope is validated structurally at the parse boundary; callers treat the
  // result as opaque until it is resolved through the asset registry.
  return {
    scope: serialized.slice(0, separatorIndex) as AssetScope,
    contentHash: serialized.slice(separatorIndex + 1),
  }
}
```

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { AssetReference, AssetScope } from './model/asset-reference'
export { formatAssetReference, parseAssetReference } from './model/asset-reference'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- asset-reference && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/model/asset-reference.test.ts
git commit -m "test: cover content-addressed asset references"
git add core/model/asset-reference.ts core/index.ts
git commit -m "feat: add content-addressed asset references"
git commit --allow-empty -m "refactor: asset-reference clean-code pass"
```

---

### Task 6: The registry pattern

Red-green-blue. The generic registry that all seven taxonomy registries share (design spec section 4.4).

**Files:**

- Create: `core/registries/registry.ts`, `core/registries/registry.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/registries/registry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createRegistry, getEntry, mergeRegistries, type RegistryEntry } from './registry'

interface Sample extends RegistryEntry {
  label: string
}

const base = createRegistry<Sample>(1, [
  { id: 'a', label: 'Base A' },
  { id: 'b', label: 'Base B' },
])

describe('registry pattern', () => {
  it('indexes entries by id', () => {
    expect(getEntry(base, 'a')?.label).toBe('Base A')
  })

  it('returns undefined for a missing id', () => {
    expect(getEntry(base, 'missing')).toBeUndefined()
  })

  it('merges overlays so later sources win on id collision', () => {
    const overlay = createRegistry<Sample>(2, [{ id: 'b', label: 'Overlay B' }])
    const merged = mergeRegistries(base, overlay)

    expect(getEntry(merged, 'a')?.label).toBe('Base A')
    expect(getEntry(merged, 'b')?.label).toBe('Overlay B')
    expect(merged.version).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- registries/registry`
Expected: FAIL, cannot resolve `./registry`.

- [ ] **Step 3: Write the implementation**

`core/registries/registry.ts`:

```typescript
export interface RegistryEntry {
  id: string
}

export interface Registry<T extends RegistryEntry> {
  version: number
  entries: Record<string, T>
}

export function createRegistry<T extends RegistryEntry>(
  version: number,
  entries: readonly T[],
): Registry<T> {
  const indexed: Record<string, T> = {}
  for (const entry of entries) {
    indexed[entry.id] = entry
  }
  return { version, entries: indexed }
}

export function getEntry<T extends RegistryEntry>(
  registry: Registry<T>,
  id: string,
): T | undefined {
  return registry.entries[id]
}

/** Overlay entries win on id collision; the merged version is the higher of the two. */
export function mergeRegistries<T extends RegistryEntry>(
  base: Registry<T>,
  overlay: Registry<T>,
): Registry<T> {
  return {
    version: Math.max(base.version, overlay.version),
    entries: { ...base.entries, ...overlay.entries },
  }
}
```

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { Registry, RegistryEntry } from './registries/registry'
export { createRegistry, getEntry, mergeRegistries } from './registries/registry'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- registries/registry && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/registries/registry.test.ts
git commit -m "test: cover the registry pattern"
git add core/registries/registry.ts core/index.ts
git commit -m "feat: add the generic registry pattern"
git commit --allow-empty -m "refactor: registry pattern clean-code pass"
```

---

### Task 7: Seed the finish registry

Red-green-blue. The six paint finishes from the design spec (section 6.8), each mapped to material-parameter presets. Registry data files carry inherent numeric parameters, so this task also exempts the registries subtree from `no-magic-numbers`.

**Files:**

- Create: `core/registries/finishes.ts`, `core/registries/finishes.test.ts`
- Modify: `core/index.ts`, `eslint.config.js`

- [ ] **Step 1: Add the registries exemption to `eslint.config.js`**

Add a new override block immediately before the final closing `)` of `tseslint.config(...)`, after the `vite.config.ts` override block:

```javascript
  {
    files: ['**/registries/**/*.ts'],
    rules: {
      // Registries are declarative data tables; numeric material parameters are
      // inherent data, not unexplained constants.
      'no-magic-numbers': 'off',
    },
  },
```

- [ ] **Step 2: Write the failing test**

`core/registries/finishes.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { FINISH_REGISTRY_VERSION, builtinFinishes } from './finishes'

describe('builtin finishes', () => {
  it('seeds the six standard paint finishes', () => {
    expect(Object.keys(builtinFinishes.entries)).toHaveLength(6)
    expect(builtinFinishes.version).toBe(FINISH_REGISTRY_VERSION)
  })

  it('maps gloss to a low roughness and high sheen', () => {
    const gloss = getEntry(builtinFinishes, 'gloss')
    expect(gloss?.roughness).toBeLessThan(0.2)
    expect(gloss?.sheen).toBeGreaterThan(0.5)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `pnpm test -- registries/finishes`
Expected: FAIL, cannot resolve `./finishes`.

- [ ] **Step 4: Write the implementation**

`core/registries/finishes.ts`:

```typescript
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/** A surface finish mapped to material-parameter presets. See design spec 6.8. */
export interface Finish extends RegistryEntry {
  id: string
  roughness: number
  sheen: number
  specular: number
}

export const FINISH_REGISTRY_VERSION = 1

export const builtinFinishes: Registry<Finish> = createRegistry(FINISH_REGISTRY_VERSION, [
  { id: 'flat', roughness: 0.95, sheen: 0, specular: 0.02 },
  { id: 'matte', roughness: 0.9, sheen: 0, specular: 0.04 },
  { id: 'eggshell', roughness: 0.7, sheen: 0.1, specular: 0.1 },
  { id: 'satin', roughness: 0.5, sheen: 0.25, specular: 0.2 },
  { id: 'semi-gloss', roughness: 0.3, sheen: 0.5, specular: 0.4 },
  { id: 'gloss', roughness: 0.1, sheen: 0.8, specular: 0.6 },
])
```

- [ ] **Step 5: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { Finish } from './registries/finishes'
export { FINISH_REGISTRY_VERSION, builtinFinishes } from './registries/finishes'
```

- [ ] **Step 6: Run the test and the chain**

Run: `pnpm test -- registries/finishes && pnpm typecheck && pnpm lint`
Expected: PASS and clean (the exemption keeps the decimal presets from warning).

- [ ] **Step 7: Commit (test, implementation, blue marker)**

```
git add core/registries/finishes.test.ts
git commit -m "test: cover the builtin finish registry"
git add core/registries/finishes.ts core/index.ts eslint.config.js
git commit -m "feat: seed the builtin finish registry"
git commit --allow-empty -m "refactor: finish registry clean-code pass"
```

---

### Task 8: Seed the element-type registry

Red-green-blue. A minimal `ElementTypeRegistry` with one wall type and one opening type. Each entry carries a 2D plan symbol and a 3D builder reference, per the design spec (section 4.4).

**Files:**

- Create: `core/registries/element-types.ts`, `core/registries/element-types.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/registries/element-types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './element-types'

describe('builtin element types', () => {
  it('seeds a straight wall and a single-swing door', () => {
    expect(getEntry(builtinElementTypes, 'straight-wall')?.category).toBe('wall')
    expect(getEntry(builtinElementTypes, 'single-swing-door')?.category).toBe('opening')
    expect(builtinElementTypes.version).toBe(ELEMENT_TYPE_REGISTRY_VERSION)
  })

  it('carries both a 2D symbol and a 3D builder for each entry', () => {
    const wall = getEntry(builtinElementTypes, 'straight-wall')
    expect(wall?.plan2D.symbol).toBeTruthy()
    expect(wall?.scene3D.builder).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- element-types`
Expected: FAIL, cannot resolve `./element-types`.

- [ ] **Step 3: Write the implementation**

`core/registries/element-types.ts`:

```typescript
import { createRegistry, type Registry, type RegistryEntry } from './registry'

export type ElementCategory = 'wall' | 'opening'

export interface Plan2DSymbol {
  /** Identifier of the 2D plan-symbol drawing routine. */
  symbol: string
}

export interface Scene3DReference {
  /** Identifier of the 3D builder routine or asset-reference key. */
  builder: string
}

export interface ElementType extends RegistryEntry {
  id: string
  category: ElementCategory
  plan2D: Plan2DSymbol
  scene3D: Scene3DReference
}

export const ELEMENT_TYPE_REGISTRY_VERSION = 1

export const builtinElementTypes: Registry<ElementType> = createRegistry(
  ELEMENT_TYPE_REGISTRY_VERSION,
  [
    {
      id: 'straight-wall',
      category: 'wall',
      plan2D: { symbol: 'wall-line' },
      scene3D: { builder: 'extruded-wall' },
    },
    {
      id: 'single-swing-door',
      category: 'opening',
      plan2D: { symbol: 'door-swing' },
      scene3D: { builder: 'door-frame' },
    },
  ],
)
```

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type {
  ElementCategory,
  ElementType,
  Plan2DSymbol,
  Scene3DReference,
} from './registries/element-types'
export { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './registries/element-types'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- element-types && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/registries/element-types.test.ts
git commit -m "test: cover the builtin element-type registry"
git add core/registries/element-types.ts core/index.ts
git commit -m "feat: seed the builtin element-type registry"
git commit --allow-empty -m "refactor: element-type registry clean-code pass"
```

---

### Task 9: Storage interfaces and the in-memory project store

Red-green-blue. Declare the three provider interfaces, then implement and test the `InMemoryProjectStore`. The `LibraryStore` and `AssetCache` interfaces are contracts verified by `typecheck`; their concrete implementations land with the storage-scaffolds plan.

**Files:**

- Create: `storage/project-store.ts`, `storage/library-store.ts`, `storage/asset-cache.ts`, `storage/in-memory-project-store.ts`, `storage/in-memory-project-store.test.ts`
- Modify: `storage/index.ts`

- [ ] **Step 1: Write the failing test**

`storage/in-memory-project-store.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../core'
import { InMemoryProjectStore } from './in-memory-project-store'

function sampleProject() {
  return createEmptyProject({
    name: 'Sample',
    units: 'metric',
    era: 'craftsman',
    appVersion: '0.1.0',
  })
}

describe('InMemoryProjectStore', () => {
  it('round-trips a saved project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    expect((await store.load('p1')).meta.name).toBe('Sample')
  })

  it('lists saved projects as summaries', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    expect(await store.list()).toEqual([{ id: 'p1', name: 'Sample' }])
  })

  it('throws when loading an unknown id', async () => {
    const store = new InMemoryProjectStore()
    await expect(store.load('missing')).rejects.toThrow('No project stored')
  })

  it('deletes a project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    await store.delete('p1')
    expect(await store.list()).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- in-memory-project-store`
Expected: FAIL, cannot resolve `./in-memory-project-store`.

- [ ] **Step 3: Declare the provider interfaces**

`storage/project-store.ts`:

```typescript
import type { Project } from '../core'

export interface ProjectSummary {
  id: string
  name: string
}

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<Project>
  save(id: string, project: Project): Promise<void>
  delete(id: string): Promise<void>
}
```

`storage/library-store.ts`:

```typescript
import type { AssetReference } from '../core'

export interface LibraryItemSummary {
  reference: AssetReference
  name: string
}

export interface LibraryStore {
  list(): Promise<LibraryItemSummary[]>
  resolve(reference: AssetReference): Promise<Uint8Array>
}
```

`storage/asset-cache.ts`:

```typescript
export interface AssetCache {
  has(contentHash: string): Promise<boolean>
  get(contentHash: string): Promise<Uint8Array | undefined>
  put(contentHash: string, bytes: Uint8Array): Promise<void>
}
```

- [ ] **Step 4: Implement the in-memory store**

`storage/in-memory-project-store.ts`:

```typescript
import type { Project } from '../core'
import type { ProjectStore, ProjectSummary } from './project-store'

/**
 * Map-backed ProjectStore for tests and the not-yet-wired app shell. Durable
 * implementations (filesystem, OPFS, zip) land with the storage-scaffolds work.
 */
export class InMemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>()

  async list(): Promise<ProjectSummary[]> {
    return [...this.projects.entries()].map(([id, project]) => ({ id, name: project.meta.name }))
  }

  async load(id: string): Promise<Project> {
    const project = this.projects.get(id)
    if (project === undefined) {
      throw new Error(`No project stored under id "${id}"`)
    }
    return project
  }

  async save(id: string, project: Project): Promise<void> {
    this.projects.set(id, project)
  }

  async delete(id: string): Promise<void> {
    this.projects.delete(id)
  }
}
```

- [ ] **Step 5: Replace the storage barrel**

`storage/index.ts`:

```typescript
export type { ProjectStore, ProjectSummary } from './project-store'
export type { LibraryItemSummary, LibraryStore } from './library-store'
export type { AssetCache } from './asset-cache'
export { InMemoryProjectStore } from './in-memory-project-store'
```

- [ ] **Step 6: Run the test and the chain**

Run: `pnpm test -- in-memory-project-store && pnpm typecheck && pnpm lint`
Expected: PASS and clean. The storage files import only from `../core`, which the boundary rule allows.

- [ ] **Step 7: Commit (test, implementation, blue marker)**

```
git add storage/in-memory-project-store.test.ts
git commit -m "test: cover the in-memory project store"
git add storage/project-store.ts storage/library-store.ts storage/asset-cache.ts storage/in-memory-project-store.ts storage/index.ts
git commit -m "feat: add storage provider interfaces and the in-memory project store"
git commit --allow-empty -m "refactor: storage layer clean-code pass"
```

---

### Task 10: Full check chain

**Files:** none.

- [ ] **Step 1: Run the complete chain**

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: every stage passes. If `format:check` flags anything, run `pnpm format`, review the diff, and amend the relevant commit. If a real failure surfaces, STOP and report.

- [ ] **Step 2: Confirm coverage now includes the new layers**

```
pnpm test -- --coverage
```

Expected: `core/**` and `storage/**` files appear in the coverage report.

---

### Task 11: Update the roadmap status

**Files:** Modify `ROADMAP.md`.

- [ ] **Step 1: Correct the stale Lighthouse row and mark the source skeleton in progress**

In the "Foundation work" table:

- Change the `Lighthouse CI, Stryker, performance harness, fixtures and factories` row from `in progress` to `done` (it merged earlier; the row was never updated).
- Change the `Six-layer source skeleton` row from `pending` to `in progress` (this plan delivers the first two layers; the remaining layers land in the follow-on plans).

- [ ] **Step 2: Verify and commit**

```
pnpm format:check
git add ROADMAP.md
git commit -m "docs: mark the source skeleton in progress on the roadmap"
```

---

### Task 12: Refresh the local knowledge graph

**Files:** local-only under `docs/knowledge/` (gitignored; not committed).

- [ ] **Step 1: Record the architectural decisions**

Dispatch the `knowledge-curator` (or write directly). Capture two things in the local ADR cache:

- Refresh ADR-0001 (six-layer architecture) to note the `core/` and `storage/` layers now exist with real modules and that boundary enforcement is verified by `tests/architecture/layer-boundaries.test.ts`.
- Record the boundary-enforcement repair as a decision: the `eslint-plugin-boundaries` v6 migration (`boundaries/dependencies`, object selectors, `core/**` patterns) plus the `import/resolver` node-extensions setting, and the architecture-fitness test that guards it.

- [ ] **Step 2: Regenerate the local index**

```
pnpm knowledge:index
```

Expected: regenerates the gitignored `INDEX.md` and `index.json`. Nothing to commit.

---

### Task 13: Update the working-notes scratchpad

**Files:** local-only `.superpowers/scratch/progress.md` (gitignored).

- [ ] **Step 1: Record progress**

After the branch merges (Task 14), capture in the scratchpad:

- A new row recording this work and its merge SHA under the merged-on-main table.
- The phase-map note that the six-layer skeleton is split into three plans: this one (core + storage), then command-dispatch-and-scene-graph, then render-and-app-skeleton. Mark the first as done; mark the second as next.
- A prep note for the next plan: the command system (`Command`, `CommandHandler`, `InverseCapture` proxy, `dispatch`, history with undo/redo/coalescing, atomic-on-error) and the scene-graph derivation (`deriveSceneGraph`, memoized projection) build directly on `core/model`. The boundary enforcement and the registries are already in place.

---

### Task 14: Finish the development branch

- [ ] **Step 1: Use the finishing-a-development-branch skill**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Verify the full check chain is green, then present the standard options. The expected path for this repository is push and open a PR to `main` (the workflow forbids pushing directly to `main`). Use the repository's PR template: Summary, Test plan (the check chain plus CI green), and the Knowledge graph checkbox (architectural change: ADR refreshed locally).

---

## Self-review

**Spec coverage.** Design spec section 2.1 (six-layer structure, boundary invariants): the `core/` and `storage/` layers and the verified boundary rule (Tasks 2, 3, 9). Section 3.1-3.2 (entity tree, modeling decisions): `Project`/`Floor`/`ProjectMeta` with millimeter units and content-addressed `AssetReference` (Tasks 4, 5). Section 3.4 (versioning): `schemaVersion`, `appVersion`, `registryVersions` on `ProjectMeta` (Task 4). Section 4.4 (registries): the generic registry pattern plus the minimal `ElementTypeRegistry` and `FinishRegistry` named in the Phase 0 deliverables (Tasks 6, 7, 8). Section 5.1 (three storage interfaces): `ProjectStore`, `LibraryStore`, `AssetCache` (Task 9). Deferred-by-design and tracked in the scope boundary: the command system and scene graph (next plan), the engine/bridge/editor/app layers and renderer (third plan), durable storage (storage-scaffolds plan), units and color (2D editor work).

**Placeholder scan.** Every code step carries complete, runnable content. No "TBD", no "add error handling", no "similar to Task N".

**Type consistency.** `Project`/`ProjectMeta`/`Floor` are defined once (Task 4) and reused unchanged by the factories, the asset index, and the storage interfaces. `Registry<T>`/`RegistryEntry`/`createRegistry`/`getEntry`/`mergeRegistries` are defined in Task 6 and consumed identically by the finish and element-type registries (Tasks 7, 8). `ProjectStore`/`ProjectSummary` are defined in Task 9 and implemented by `InMemoryProjectStore` in the same task. The barrel export names match their source declarations across Tasks 4 through 9.
