# Wall construction profiles (issue #365) Implementation Plan

> **For agentic workers:** Implement task-by-task with the project red-green-blue
> TDD cycle (`/test-first`, `/implement`, `/clean-code-review`, `/refactor`).
> Steps use checkbox (`- [ ]`) syntax for tracking. Schema-coupled steps in Task 1
> are orchestrator-driven lockstep edits, not role-separated subagent work.

**Goal:** Let a wall reference a construction profile so a layered historic
assembly (lath and plaster over studs, solid masonry) drives the wall's footprint
thickness instead of a single hand-entered number.

**Architecture:** The construction-profile data and resolve layer already exist and
are tested (`core/registries/construction-profiles.ts`,
`core/scene/construction-profile.ts`). This plan wires them in: an optional
registry-id field on the `Wall` model (a versioned schema change), the same id
carried onto the derived `WallSceneNode`, a pure helper that turns the id into an
effective footprint thickness, and the 3D wall builder reading that helper.

**Tech Stack:** TypeScript, Vitest, Ajv (generated CORE JSON Schema), Three.js
(engine layer only).

## Global Constraints

- `core/` imports neither React nor Three.js; `engine/` is the only Three.js importer.
- Registry-parameterized model data is a bare id alias validated at the registry
  boundary, not by the model type (precedent: `Opening.type`, `RoomOverride.purpose`).
- The CORE JSON Schema is generated from the model and committed per version under
  `schema/<version>/`; published versions are immutable; `pnpm schema:check` guards drift.
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on: omit an
  optional field rather than passing `undefined`.
- eslint budget: max-params 3, max-lines-per-function 40, max-lines 300,
  no-magic-numbers, no-nested-ternary; zero new warnings.
- No `Co-Authored-By`/`Claude-Session` trailer; no em-dash in new prose;
  Conventional Commits; never `--no-verify` a test/feat commit.
- Filter tests with `pnpm exec vitest run <path>`; verify each gate's own exit code.

---

### Task 1: `Wall.constructionProfile` model field + schema version 12 + migration

The model field, the version bump, the regenerated schema artifact, and the
`from: 11` migration are one atomic change: bumping `CURRENT_SCHEMA_VERSION`
without a `from: 11` migration makes `migrateProject` throw `MigrationFailedError`,
and the pinned `factories.test.ts` assertion breaks the moment the constant moves.
Land them together.

**Files:**

- Modify: `core/model/types.ts:68-76` (the `Wall` interface)
- Modify: `core/model/factories.ts:36` (`CURRENT_SCHEMA_VERSION = 11` -> `12`)
- Modify: `core/model/factories.test.ts:101` (pin `toBe(11)` -> `toBe(12)`)
- Create: `core/migrations/schema/add-wall-construction-profile.ts`
- Create: `core/migrations/schema/add-wall-construction-profile.test.ts`
- Modify: `core/migrations/schema/index.ts` (register the migration)
- Generate: `schema/12/vernacular.schema.json` (via `pnpm schema:generate`)

**Interfaces:**

- Produces: `Wall.constructionProfile?: string` (a `ConstructionProfileRegistry`
  id). `addWallConstructionProfileMigration: SchemaMigration` with `from: 11`,
  an identity passthrough (the field is optional, so a v11 document needs no
  backfill; the orchestrator advances `meta.schemaVersion`).

- [ ] **Step 1: Write the failing migration test**

`core/migrations/schema/add-wall-construction-profile.test.ts` (mirror
`add-furniture-height.test.ts`, but assert passthrough since nothing is backfilled):

```typescript
import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addWallConstructionProfileMigration } from './add-wall-construction-profile'

const VERSION_ELEVEN = 11

function makeVersionElevenDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_ELEVEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 120 }],
        openings: [],
        underlays: [],
        dimensions: [],
        furniture: [],
      },
    ],
  } as ProjectShape
}

describe('add-wall-construction-profile schema migration', () => {
  it('starts its forward step from schema version 11', () => {
    expect(addWallConstructionProfileMigration.from).toBe(VERSION_ELEVEN)
  })

  it('leaves an existing wall unchanged (no backfill for an optional field)', () => {
    const migrated = addWallConstructionProfileMigration.migrate(makeVersionElevenDocument())
    const wall = (migrated as { floors?: { walls?: { constructionProfile?: string }[] }[] })
      .floors?.[0]?.walls?.[0]
    expect(wall?.constructionProfile).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addWallConstructionProfileMigration.migrate(makeVersionElevenDocument())
    expect((migrated as { meta?: { schemaVersion?: number } }).meta?.schemaVersion).toBe(
      VERSION_ELEVEN,
    )
  })
})
```

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm exec vitest run core/migrations/schema/add-wall-construction-profile.test.ts`
Expected: FAIL (module `./add-wall-construction-profile` not found).

- [ ] **Step 3: Create the migration**

`core/migrations/schema/add-wall-construction-profile.ts`:

```typescript
import type { SchemaMigration } from '../types'

/**
 * Migrates a version-11 document to version 12. `Wall.constructionProfile` is an
 * optional registry-id alias, so a version-11-and-earlier wall simply omits it and
 * is already valid at version 12; this migration is a passthrough. The
 * orchestrator advances `meta.schemaVersion`, so the migration must not.
 */
export const addWallConstructionProfileMigration: SchemaMigration = {
  from: 11,
  migrate(project) {
    return project
  },
}
```

- [ ] **Step 4: Register the migration**

In `core/migrations/schema/index.ts`, add the import (alphabetical with siblings)
and append `addWallConstructionProfileMigration` to the end of `SCHEMA_MIGRATIONS`.

- [ ] **Step 5: Add the model field**

In `core/model/types.ts`, add to the `Wall` interface (after `thickness`, before
`extensions`):

```typescript
  /**
   * References an entry in the ConstructionProfileRegistry. Validated at the
   * registry boundary, not by this alias. Absent preserves the single-`thickness`
   * footprint; present resolves to the assembly's total thickness.
   */
  constructionProfile?: string
```

- [ ] **Step 6: Bump the version + the pinned assertion (lockstep)**

`core/model/factories.ts:36`: `export const CURRENT_SCHEMA_VERSION = 12`.
`core/model/factories.test.ts:101`: `expect(CURRENT_SCHEMA_VERSION).toBe(12)`.

- [ ] **Step 7: Regenerate the schema artifact**

Run: `pnpm schema:generate`
Expected: `Wrote schema/12/vernacular.schema.json`. Confirm the new file's `Wall`
definition lists `constructionProfile` and that `schema/8..11` are untouched.

- [ ] **Step 8: Run the gates; verify green**

Run: `pnpm exec vitest run core/migrations core/model/factories.test.ts core/format`
then `pnpm schema:check` then `pnpm typecheck`.
Expected: all PASS; `schema:check` reports `schema/12/... is up to date.`

- [ ] **Step 9: Commit**

```bash
git add core/model/types.ts core/model/factories.ts core/model/factories.test.ts \
  core/migrations/schema/add-wall-construction-profile.ts \
  core/migrations/schema/add-wall-construction-profile.test.ts \
  core/migrations/schema/index.ts schema/12/vernacular.schema.json
git commit -m "feat: add optional Wall.constructionProfile field at schema version 12"
```

- [ ] **Step 10: Close the cycle (BLUE)**

Run `/clean-code-review` then `/refactor`; land the (possibly empty) refactor marker.

---

### Task 2: Carry `constructionProfile` onto the derived `WallSceneNode`

**Files:**

- Modify: `core/scene/scene-graph.ts:38-53` (`WallSceneNode` interface)
- Modify: `core/scene/scene-graph.ts:175-185` (`deriveWallNode`)
- Test: `core/scene/scene-graph.test.ts` (co-located; add a case)

**Interfaces:**

- Consumes: `Wall.constructionProfile` from Task 1.
- Produces: `WallSceneNode.constructionProfile?: string`, populated by
  `deriveWallNode` when the model wall carries it (omitted otherwise, per
  `exactOptionalPropertyTypes`).

- [ ] **Step 1: Write the failing test**

Add to `core/scene/scene-graph.test.ts`:

```typescript
it('carries the wall construction profile id onto the derived node', () => {
  const floor = { id: 'f1', name: 'G', defaultCeilingHeight: 2400 } as Floor
  const wall = {
    id: 'w1',
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
    thickness: 120,
    constructionProfile: 'solid-masonry-brick',
  } as Wall
  expect(deriveWallNode(floor, wall).constructionProfile).toBe('solid-masonry-brick')
})

it('omits constructionProfile on the node when the wall has none', () => {
  const floor = { id: 'f1', name: 'G', defaultCeilingHeight: 2400 } as Floor
  const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 120 } as Wall
  expect('constructionProfile' in deriveWallNode(floor, wall)).toBe(false)
})
```

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm exec vitest run core/scene/scene-graph.test.ts`
Expected: FAIL (node lacks `constructionProfile`).

- [ ] **Step 3: Implement**

Add `constructionProfile?: string` to the `WallSceneNode` interface (after
`height?`), with a one-line doc: "The wall's ConstructionProfileRegistry id when
it carries one; resolved to a footprint thickness by `effectiveWallThickness`."

In `deriveWallNode`, conditionally spread the field so it is omitted when absent:

```typescript
export function deriveWallNode(floor: Floor, wall: Wall): WallSceneNode {
  return {
    id: `${WALL_NODE_PREFIX}${wall.id}`,
    kind: 'wall',
    floorId: floor.id,
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness,
    height: floor.defaultCeilingHeight,
    ...(wall.constructionProfile === undefined
      ? {}
      : { constructionProfile: wall.constructionProfile }),
  }
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `pnpm exec vitest run core/scene/scene-graph.test.ts` then `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/scene/scene-graph.ts core/scene/scene-graph.test.ts
git commit -m "feat: carry constructionProfile onto the derived wall scene node"
```

- [ ] **Step 6: Close the cycle (BLUE)** Run `/clean-code-review` then `/refactor`.

---

### Task 3: `effectiveWallThickness` pure helper

Keep the resolve logic in pure core so the engine read stays trivial and the
behavior is unit-tested without Three.js.

**Files:**

- Modify: `core/scene/construction-profile.ts` (add the helper)
- Modify: `core/index.ts` (export it alongside the other construction-profile exports)
- Test: `core/scene/construction-profile.test.ts` (add cases)

**Interfaces:**

- Consumes: `resolveConstructionProfile` (existing), `WallSceneNode` (type only).
- Produces: `effectiveWallThickness(node, constructionProfiles?): number` returning
  the resolved assembly `totalThickness` when the node carries a registry-known
  profile, else the node's raw `thickness` (also the fallback for an unknown id).

- [ ] **Step 1: Write the failing test**

Add to `core/scene/construction-profile.test.ts`:

```typescript
import { effectiveWallThickness } from './construction-profile'

describe('effectiveWallThickness', () => {
  it('returns the raw thickness when the node carries no profile', () => {
    expect(effectiveWallThickness({ thickness: 120 })).toBe(120)
  })

  it('returns the resolved assembly total thickness for a known profile', () => {
    const node = { thickness: 120, constructionProfile: 'solid-masonry-brick' }
    expect(effectiveWallThickness(node)).toBe(
      resolveConstructionProfile('solid-masonry-brick')?.totalThickness,
    )
  })

  it('falls back to raw thickness for an unknown profile id', () => {
    expect(effectiveWallThickness({ thickness: 120, constructionProfile: 'no-such-id' })).toBe(120)
  })
})
```

(`resolveConstructionProfile` is already imported in this test file.)

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm exec vitest run core/scene/construction-profile.test.ts`
Expected: FAIL (`effectiveWallThickness` not exported).

- [ ] **Step 3: Implement**

Append to `core/scene/construction-profile.ts`:

```typescript
/**
 * The footprint thickness a wall node draws to: the resolved assembly total when
 * the node references a registry-known construction profile, otherwise the node's
 * raw thickness. An unknown id also falls back to the raw thickness, so a missing
 * registry entry degrades to today's single-thickness behavior rather than
 * collapsing the wall to zero.
 */
export function effectiveWallThickness(
  node: { thickness: number; constructionProfile?: string },
  constructionProfiles: Registry<ConstructionProfile> = builtinConstructionProfiles,
): number {
  if (node.constructionProfile === undefined) return node.thickness
  return (
    resolveConstructionProfile(node.constructionProfile, constructionProfiles)?.totalThickness ??
    node.thickness
  )
}
```

In `core/index.ts`, add `effectiveWallThickness` to the existing
`export { ... } from './scene/construction-profile'` block.

- [ ] **Step 4: Run it; verify it passes**

Run: `pnpm exec vitest run core/scene/construction-profile.test.ts` then `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/scene/construction-profile.ts core/scene/construction-profile.test.ts core/index.ts
git commit -m "feat: add effectiveWallThickness resolving a wall node footprint thickness"
```

- [ ] **Step 6: Close the cycle (BLUE)** Run `/clean-code-review` then `/refactor`.

---

### Task 4: 3D wall builder reads the construction-profile footprint thickness

**Files:**

- Modify: `engine/scene/wall-builder.ts:51-69` (`buildWalls`: `thicknessByEdge`)
- Test: `engine/scene/wall-builder.test.ts` (add a case; reuse `wall-test-support.ts`)

**Interfaces:**

- Consumes: `effectiveWallThickness` (Task 3), `WallSceneNode.constructionProfile`
  (Task 2). `wallFootprints(graph, thicknessByEdge)` is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `engine/scene/wall-builder.test.ts` a case mirroring "builds a single box
for an unsplit wall with no openings", but giving the wall a thicker masonry
profile and asserting the box's cross-wall dimension equals the profile total
thickness, not the raw `thickness`. Use the existing `wall-test-support.ts`
builders; resolve the expected number from `resolveConstructionProfile`:

```typescript
it('sizes a wall footprint from its construction profile total thickness', () => {
  const expected = resolveConstructionProfile('solid-masonry-brick')?.totalThickness
  // build one unsplit wall node carrying constructionProfile: 'solid-masonry-brick'
  // via the wall-test-support helpers, run buildWalls, read the single mesh's
  // cross-wall bounding-box dimension, and assert it equals `expected`
  //   (and that `expected` differs from the node's raw thickness so the test bites).
})
```

(Fill the body with the file's existing box-dimension helper; keep raw `thickness`
distinct from `expected` so the assertion fails before Step 3.)

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm exec vitest run engine/scene/wall-builder.test.ts`
Expected: FAIL (footprint still uses raw `thickness`).

- [ ] **Step 3: Implement**

In `engine/scene/wall-builder.ts`, import `effectiveWallThickness` from `../../core`
and resolve per edge:

```typescript
const thicknessByEdge = input.graph.edges.map((edge) => {
  const node = wallsByModelId.get(edge.wallId)
  return node === undefined ? 0 : effectiveWallThickness(node)
})
```

`buildJunctionFills` already receives `thicknessByEdge`, so it follows
automatically; no separate change there.

- [ ] **Step 4: Run it; verify it passes**

Run: `pnpm exec vitest run engine/scene/wall-builder.test.ts` then `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/scene/wall-builder.ts engine/scene/wall-builder.test.ts
git commit -m "feat: size 3D wall footprints from the construction-profile thickness"
```

- [ ] **Step 6: Close the cycle (BLUE)** Run `/clean-code-review` then `/refactor`.

---

### Task 5: ADR-0137 + reviews + merge

- [ ] **Step 1: Write ADR-0137** (`/adr wall-construction-profiles "Wall construction profiles"`)
      recording: the registry-id-on-`Wall` design (validate-at-boundary, the
      `Opening.type` precedent), the schema version 11 -> 12 bump with a passthrough
      migration, footprint thickness resolved in pure core via `effectiveWallThickness`,
      and per-layer 3D material rendering deferred to #380. Run the `humanizer` pass
      (ADRs are human-read). Commit `docs: record ADR-0137 wall construction profiles`.
- [ ] **Step 2: Run `/clean-code-review` and `/review`** across `origin/main..HEAD`;
      surface any ADR-undocumented deviation for owner sign-off.
- [ ] **Step 3: Full gate chain:**
      `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
      (verify each command's own exit code).
- [ ] **Step 4: Merge** the branch into `integration/local-staging` with
      `--no-ff --no-verify` (merge commit only). Record the GitHub follow-up (close #365
      on owner merge) in `docs/brainstorm-prep/autonomous-run/GITHUB-PENDING.md`; append
      the run entry to `PROGRESS.md`. Do not perform any GitHub write.

---

## Self-Review notes

- Spec coverage: issue #365 names (1) layered assemblies as a registry parameter on
  the wall, (2) per-layer thickness/material the 3D builder and 2D symbol read,
  (3) scope = model + registry data + rendering hooks, core stays pure. Tasks 1-4
  cover the model id, the 3D builder read, and the pure resolve. The 2D plan wall
  symbol read is named in the issue but the backlog scopes #365's render hook to
  the 3D builder; track the 2D symbol as a follow-up note (file an issue at merge),
  and per-layer 3D materials are #380. State this in ADR-0137 so the partial render
  coverage is deliberate, not a gap.
- Type consistency: `constructionProfile?: string` is the same name on `Wall`,
  `WallSceneNode`, and the `effectiveWallThickness` param; `effectiveWallThickness`
  is defined in Task 3 and consumed in Task 4 under that exact name.
