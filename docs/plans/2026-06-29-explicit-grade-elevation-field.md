# Explicit Grade Elevation Field Implementation Plan

> **For agentic workers:** This plan is executed from the MAIN thread with the project's role-separated
> RGB subagents (test-author -> implementer -> clean-code-reviewer -> refactorer) per cycle, then
> pr-reviewer at branch end. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ground-surface grade datum data-driven via an explicit `Site.gradeElevation` model
field, so the ground plane and the underground-floor filter read grade from the model instead of a
hardcoded elevation of 0.

**Architecture:** Grade is project-site metadata, so it lands on `core/model/site.ts` as an optional
`gradeElevation` field (millimeters, absent = the 0 datum). `deriveSceneGraph` resolves it onto a new
optional `SceneGraph.gradeElevation`, which then travels with the graph through the bridge's
floor/building filters into the engine. The bridge underground filter compares floor elevations to the
graph grade, and the engine ground plane seats itself at the graph grade. Both keep a default of 0 so
every existing hand-built `SceneGraph` literal stays valid.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest,
Three.js (engine only), ts-json-schema-generator for the serialized CORE schema.

## Global Constraints

- `core/` imports neither React nor Three.js; `engine/` is the only Three.js importer (ADR-0001).
- `exactOptionalPropertyTypes` ON: OMIT optional fields, never assign `undefined`. Use the
  spread-conditional idiom: `...(x === undefined ? {} : { key: x })`.
- ESLint: max-params 3, max-lines-per-function 40, max-lines 300, no-nested-ternary; warnings count but
  pre-existing ones are accepted, zero NEW warnings. `no-magic-numbers` ignores `[-1, 0, 1, 2, 100]`.
- Conventional Commits; no `Co-Authored-By`/AI-session trailers; no em-dashes in new prose.
- Author identity `Dan Moore <9156191+drmrd@users.noreply.github.com>`.
- Adding a `core/model` field that flows into the serialized schema requires a `CURRENT_SCHEMA_VERSION`
  bump, a passthrough migration, and a regenerated `schema/<n>/vernacular.schema.json`.
- Filter tests with `pnpm exec vitest run <path>` (NOT `pnpm test -- <path>`); verify each gate
  command's own exit code.
- Gate type: unit (no visual baseline). Next free ADR = ADR-0138.

## Scope

In scope: a single explicit grade-elevation datum that decouples the ground surface from the
finished-floor-zero datum (raised foundations, uniform above-grade exposure). Out of scope (deferred to a
follow-up issue): per-edge / sloped-site / stepped-foundation exposure modeling. ADR-0131 recorded grade
_or_ above-grade-exposure as alternative follow-ups; this plan closes the grade half.

## File Structure

- `core/model/site.ts` — add `gradeElevation?` to `Site`; add `DEFAULT_GRADE_ELEVATION_MM` and
  `resolveGradeElevation(site?)`.
- `core/scene/scene-graph.ts` — add optional `gradeElevation` to `SceneGraph`; `deriveSceneGraph`
  populates it via `resolveGradeElevation`.
- `core/scene/scene-graph-for-floor.ts` — forward `gradeElevation` through the floor narrowing.
- `bridge/react/view-scene-graph.ts` — underground filter compares to graph grade; forward grade.
- `engine/scene/ground-plane.ts` — `addGroundPlane` accepts a grade; mesh sits at it.
- `engine/scene/build-scene.ts` — pass `graph.gradeElevation` into `addGroundPlane`.
- `core/migrations/schema/add-site-grade-elevation.ts` (+ test) — passthrough 12 -> 13.
- `core/migrations/schema/index.ts` — register the migration.
- `core/model/factories.ts` — bump `CURRENT_SCHEMA_VERSION` to 13.
- `schema/13/vernacular.schema.json` — regenerated.
- `core/index.ts` — export the new core symbols if barrel-exported alongside siblings.

---

## Task 1: Site grade field + scene-graph derivation

**Files:**

- Modify: `core/model/site.ts`
- Modify: `core/scene/scene-graph.ts:160-169` (interface), `:315-328` (`deriveSceneGraph`)
- Modify: `core/index.ts` (barrel export, if `Site` siblings are exported there)
- Test: `core/model/site.test.ts`, `core/scene/scene-graph.test.ts`

**Interfaces:**

- Produces: `Site.gradeElevation?: number`; `DEFAULT_GRADE_ELEVATION_MM: number` (= 0);
  `resolveGradeElevation(site?: Site): number`; `SceneGraph.gradeElevation?: number`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test** — `resolveGradeElevation` returns the site value and defaults
      to the datum when the field or the site is absent.

```ts
// core/model/site.test.ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_ELEVATION_MM, resolveGradeElevation, type Site } from './site'

describe('resolveGradeElevation', () => {
  it('returns the site grade elevation when present', () => {
    const site: Site = { gradeElevation: -600 }
    expect(resolveGradeElevation(site)).toBe(-600)
  })

  it('falls back to the datum when grade is absent', () => {
    expect(resolveGradeElevation({})).toBe(DEFAULT_GRADE_ELEVATION_MM)
  })

  it('falls back to the datum when the site is absent', () => {
    expect(resolveGradeElevation(undefined)).toBe(DEFAULT_GRADE_ELEVATION_MM)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm exec vitest run core/model/site.test.ts`;
      expected FAIL (`resolveGradeElevation` / `DEFAULT_GRADE_ELEVATION_MM` not exported).

- [ ] **Step 3: Write minimal implementation** in `core/model/site.ts`.

```ts
/**
 * Ground-surface grade datum, in millimeters, used when a site carries no explicit
 * grade. Above-grade floors sit at positive elevations and basements at negative
 * ones relative to this datum (ADR-0131).
 */
export const DEFAULT_GRADE_ELEVATION_MM = 0

// add to interface Site:
  /**
   * Ground-surface elevation in millimeters: the datum the ground plane sits at and
   * the threshold the whole-building view treats as below grade. Absent means the
   * 0 datum, decoupling grade from the finished-floor-zero convention only when set.
   */
  gradeElevation?: number

/** The site's explicit grade elevation, or the default datum when none is set. */
export function resolveGradeElevation(site?: Site): number {
  return site?.gradeElevation ?? DEFAULT_GRADE_ELEVATION_MM
}
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm exec vitest run core/model/site.test.ts`; PASS.

- [ ] **Step 5: Write the failing test** — `deriveSceneGraph` carries the resolved grade onto the graph.

```ts
// core/scene/scene-graph.test.ts (add to the existing deriveSceneGraph describe)
it('carries the site grade elevation onto the scene graph', () => {
  const project = makeProject({ site: { gradeElevation: -600 } }) // existing fixture helper
  expect(deriveSceneGraph(project).gradeElevation).toBe(-600)
})

it('defaults the scene-graph grade to the datum when no site grade is set', () => {
  const project = makeProject({})
  expect(deriveSceneGraph(project).gradeElevation).toBe(0)
})
```

> If `core/scene/scene-graph.test.ts` has no `makeProject` helper, build the `Project` literal inline
> using the existing factory (`createProject` from `core/model/factories.ts`) and set `.site`.

- [ ] **Step 6: Run test to verify it fails** — `pnpm exec vitest run core/scene/scene-graph.test.ts`;
      expected FAIL (`gradeElevation` undefined on the derived graph).

- [ ] **Step 7: Write minimal implementation** — add the field to `SceneGraph` and populate it.

```ts
// core/scene/scene-graph.ts — interface SceneGraph, add:
  /**
   * Ground-surface grade datum in millimeters for this projection. Optional so
   * hand-built literals omit it; `deriveSceneGraph` always sets it and readers
   * default to the 0 datum. Forwarded by the floor and building filters.
   */
  gradeElevation?: number

// deriveSceneGraph return object, add:
    gradeElevation: resolveGradeElevation(project.site),
```

Import `resolveGradeElevation` from `../model/site`.

- [ ] **Step 8: Run test to verify it passes** — `pnpm exec vitest run core/scene/scene-graph.test.ts`;
      PASS.

- [ ] **Step 9: Typecheck + lint the touched files** —
      `pnpm typecheck` (exit 0) and `pnpm exec eslint core/model/site.ts core/scene/scene-graph.ts` (0 new).

- [ ] **Step 10: Commit**

```bash
git add core/model/site.ts core/scene/scene-graph.ts core/index.ts \
  core/model/site.test.ts core/scene/scene-graph.test.ts
git commit -m "feat: resolve an explicit site grade elevation onto the scene graph"
```

- [ ] **Step 11: BLUE** — `/clean-code-review` over the diff; `/refactor` (empty marker commit if no
      actionable findings). Any should-fix in a test file is applied from the MAIN thread, not the
      refactorer.

---

## Task 2: Underground filter reads the model grade

**Files:**

- Modify: `bridge/react/view-scene-graph.ts:9-49`
- Modify: `core/scene/scene-graph-for-floor.ts:20-38`
- Test: `bridge/react/view-scene-graph.test.ts`, `core/scene/scene-graph-for-floor.test.ts`

**Interfaces:**

- Consumes: `SceneGraph.gradeElevation` (Task 1).
- Produces: `sceneGraphForBuilding` and `sceneGraphForFloor` forward `gradeElevation`;
  `sceneGraphForBuilding` hides floors with `elevation < grade` (grade from the graph, default 0).

- [ ] **Step 1: Write the failing test** — a floor above a negative grade is kept; a floor below it is
      hidden.

```ts
// bridge/react/view-scene-graph.test.ts
it('hides only floors below the model grade datum', () => {
  const graph: SceneGraph = {
    ...emptyGraph(), // existing helper, or inline the 8 empty arrays
    gradeElevation: -600,
    nodes: [
      { id: 'floor:above', kind: 'floor', name: 'Raised', elevation: -400 },
      { id: 'floor:below', kind: 'floor', name: 'Cellar', elevation: -800 },
    ],
  }
  const projected = sceneGraphForBuilding(graph, { includeUnderground: false })
  expect(projected.nodes.map((n) => n.id)).toEqual(['floor:above'])
})

it('forwards the grade elevation onto the projected building graph', () => {
  const graph: SceneGraph = { ...emptyGraph(), gradeElevation: -600 }
  expect(sceneGraphForBuilding(graph, { includeUnderground: false }).gradeElevation).toBe(-600)
})
```

- [ ] **Step 2: Run test to verify it fails** —
      `pnpm exec vitest run bridge/react/view-scene-graph.test.ts`; expected FAIL (`floor:above` hidden
      because the filter still compares to 0; `gradeElevation` dropped from the projection).

- [ ] **Step 3: Write minimal implementation** in `bridge/react/view-scene-graph.ts`.

```ts
import { DEFAULT_GRADE_ELEVATION_MM } from '../../core'

// replace the hardcoded GROUND_ELEVATION_MM use in hiddenFloorIds:
function hiddenFloorIds(graph: SceneGraph, options: BuildingViewOptions): Set<string> {
  if (options.includeUnderground) {
    return new Set()
  }
  const grade = graph.gradeElevation ?? DEFAULT_GRADE_ELEVATION_MM
  return new Set(
    graph.nodes.filter((node) => node.elevation < grade).map((node) => floorModelId(node)),
  )
}

// in sceneGraphForBuilding's returned object, forward grade:
    ...(graph.gradeElevation === undefined ? {} : { gradeElevation: graph.gradeElevation }),
```

Remove the now-unused local `GROUND_ELEVATION_MM` constant. Export `DEFAULT_GRADE_ELEVATION_MM` from
`core/index.ts` if it is not already.

- [ ] **Step 4: Run test to verify it passes** —
      `pnpm exec vitest run bridge/react/view-scene-graph.test.ts`; PASS.

- [ ] **Step 5: Write the failing test** — `sceneGraphForFloor` preserves grade so a floor-scoped view's
      ground plane sits correctly.

```ts
// core/scene/scene-graph-for-floor.test.ts
it('preserves the grade elevation when narrowing to a floor', () => {
  const graph: SceneGraph = {
    ...emptyGraph(),
    gradeElevation: -600,
    nodes: [{ id: 'floor:a', kind: 'floor', name: 'A', elevation: 0 }],
  }
  expect(sceneGraphForFloor(graph, 'a').gradeElevation).toBe(-600)
})
```

- [ ] **Step 6: Run test to verify it fails** —
      `pnpm exec vitest run core/scene/scene-graph-for-floor.test.ts`; expected FAIL (grade dropped).

- [ ] **Step 7: Write minimal implementation** — forward grade in both `sceneGraphForFloor` branches.
      The `emptyGraph()` (null floor) path leaves grade unset (defaults to the datum); the narrowing path
      forwards it with the spread-conditional idiom.

```ts
// core/scene/scene-graph-for-floor.ts — in the non-null return object:
    ...(graph.gradeElevation === undefined ? {} : { gradeElevation: graph.gradeElevation }),
```

- [ ] **Step 8: Run test to verify it passes** —
      `pnpm exec vitest run core/scene/scene-graph-for-floor.test.ts`; PASS.

- [ ] **Step 9: Typecheck + lint** — `pnpm typecheck` (0);
      `pnpm exec eslint bridge/react/view-scene-graph.ts core/scene/scene-graph-for-floor.ts` (0 new).

- [ ] **Step 10: Commit**

```bash
git add bridge/react/view-scene-graph.ts core/scene/scene-graph-for-floor.ts \
  bridge/react/view-scene-graph.test.ts core/scene/scene-graph-for-floor.test.ts core/index.ts
git commit -m "feat: hide underground floors against the model grade datum"
```

- [ ] **Step 11: BLUE** — `/clean-code-review`; `/refactor`.

---

## Task 3: Ground plane sits at the model grade

**Files:**

- Modify: `engine/scene/ground-plane.ts:42-91`
- Modify: `engine/scene/build-scene.ts:36`
- Test: `engine/scene/ground-plane.test.ts`

**Interfaces:**

- Consumes: `SceneGraph.gradeElevation` (Task 1), passed by `buildScene`.
- Produces: `addGroundPlane(root: THREE.Object3D, gradeElevation?: number): void` seats the plane at the
  given grade, defaulting to `GRADE_ELEVATION_MM`.

- [ ] **Step 1: Write the failing test** — the plane sits at a supplied grade.

```ts
// engine/scene/ground-plane.test.ts
it('seats the ground plane at the supplied grade elevation', () => {
  const root = new THREE.Group()
  addGroundPlane(root, 1500)
  const ground = root.children.find(isGroundPlane)!
  expect(new THREE.Box3().setFromObject(ground).min.y).toBeCloseTo(1500)
})
```

- [ ] **Step 2: Run test to verify it fails** —
      `pnpm exec vitest run engine/scene/ground-plane.test.ts`; expected FAIL (plane sits at 0; the second
      arg is ignored / not yet accepted).

- [ ] **Step 3: Write minimal implementation** in `engine/scene/ground-plane.ts`.

```ts
function groundMesh(footprint: GroundFootprint, gradeElevation: number): THREE.Mesh {
  // ...unchanged geometry/material...
  mesh.position.set(footprint.centerX, gradeElevation, footprint.centerZ)
  // ...unchanged...
}

export function addGroundPlane(
  root: THREE.Object3D,
  gradeElevation: number = GRADE_ELEVATION_MM,
): void {
  root.add(groundMesh(groundFootprint(root), gradeElevation))
}
```

- [ ] **Step 4: Run test to verify it passes** —
      `pnpm exec vitest run engine/scene/ground-plane.test.ts`; PASS (the existing default-grade tests still
      pass via the `GRADE_ELEVATION_MM` default).

- [ ] **Step 5: Wire `buildScene`** to pass the graph grade.

```ts
// engine/scene/build-scene.ts — replace addGroundPlane(root) with:
addGroundPlane(root, graph.gradeElevation)
```

> `graph.gradeElevation` is `number | undefined`; the param default handles `undefined`, so passing it
> directly is correct and keeps the default-0 behavior for literals that omit grade.

- [ ] **Step 6: Run the engine + build-scene tests** —
      `pnpm exec vitest run engine/scene/ground-plane.test.ts engine/scene/build-scene.test.ts`; PASS.

- [ ] **Step 7: Typecheck + lint** — `pnpm typecheck` (0);
      `pnpm exec eslint engine/scene/ground-plane.ts engine/scene/build-scene.ts` (0 new).

- [ ] **Step 8: Commit**

```bash
git add engine/scene/ground-plane.ts engine/scene/build-scene.ts engine/scene/ground-plane.test.ts
git commit -m "feat: seat the ground plane at the model grade elevation"
```

- [ ] **Step 9: BLUE** — `/clean-code-review`; `/refactor`.

---

## Task 4: Schema v13 + passthrough migration

**Files:**

- Modify: `core/model/factories.ts:37` (`CURRENT_SCHEMA_VERSION = 13`)
- Create: `core/migrations/schema/add-site-grade-elevation.ts`
- Create: `core/migrations/schema/add-site-grade-elevation.test.ts`
- Modify: `core/migrations/schema/index.ts`
- Create: `schema/13/vernacular.schema.json` (generated)
- Test: existing `core/migrations/migrate.test.ts` exercises the chain end-to-end.

**Interfaces:**

- Consumes: `Site.gradeElevation` (Task 1) — the field that makes the version-13 document shape.
- Produces: `addSiteGradeElevationMigration: SchemaMigration` (`from: 12`), registered last.

- [ ] **Step 1: Write the failing test** — a version-12 document migrates to 13 as a passthrough,
      inventing no grade.

```ts
// core/migrations/schema/add-site-grade-elevation.test.ts
import { describe, expect, it } from 'vitest'
import { addSiteGradeElevationMigration } from './add-site-grade-elevation'

describe('add-site-grade-elevation schema migration', () => {
  it('migrates from version 12', () => {
    expect(addSiteGradeElevationMigration.from).toBe(12)
  })

  it('does not invent a site or a grade elevation', () => {
    const project = { meta: {}, floors: [] } as never
    const migrated = addSiteGradeElevationMigration.migrate(project) as { site?: unknown }
    expect('site' in migrated).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** —
      `pnpm exec vitest run core/migrations/schema/add-site-grade-elevation.test.ts`; FAIL (module missing).

- [ ] **Step 3: Write minimal implementation** — mirror `add-wall-construction-profile.ts`.

```ts
// core/migrations/schema/add-site-grade-elevation.ts
import type { SchemaMigration } from '../types'

/**
 * Migrates a version-12 document to version 13. `Site.gradeElevation` is an
 * optional field, so a version-12-and-earlier document simply omits it and is
 * already valid at version 13; this migration is a passthrough. The orchestrator
 * advances `meta.schemaVersion`, so the migration must not.
 */
export const addSiteGradeElevationMigration: SchemaMigration = {
  from: 12,
  migrate(project) {
    return project
  },
}
```

- [ ] **Step 4: Register the migration** in `core/migrations/schema/index.ts` — import it and append
      `addSiteGradeElevationMigration` to the end of `SCHEMA_MIGRATIONS`.

- [ ] **Step 5: Bump the version** — `core/model/factories.ts`: `CURRENT_SCHEMA_VERSION = 13`.

- [ ] **Step 6: Run the migration tests** —
      `pnpm exec vitest run core/migrations/schema/add-site-grade-elevation.test.ts core/migrations/migrate.test.ts`;
      PASS (the chain now reaches 13).

- [ ] **Step 7: Regenerate the schema** — `pnpm schema:generate`; confirm `schema/13/vernacular.schema.json`
      is created and contains a `gradeElevation` property under the `Site` definition. Then
      `pnpm schema:check` exits 0.

- [ ] **Step 8: Full unit run + typecheck + lint** — `pnpm typecheck` (0);
      `pnpm exec vitest run` (all pass); `pnpm lint` (0 new warnings).

- [ ] **Step 9: Commit**

```bash
git add core/model/factories.ts core/migrations/schema/add-site-grade-elevation.ts \
  core/migrations/schema/add-site-grade-elevation.test.ts core/migrations/schema/index.ts \
  schema/13/vernacular.schema.json
git commit -m "feat: bump the project schema to version 13 for the site grade elevation"
```

- [ ] **Step 10: BLUE** — `/clean-code-review`; `/refactor`.

---

## Task 5: ADR-0138, branch review, and merge

**Files:**

- Create: `docs/knowledge/decisions/ADR-0138-explicit-grade-elevation-field.md`

- [ ] **Step 1: Write ADR-0138** documenting the decision: grade is site metadata
      (`Site.gradeElevation`, mm, default 0), resolved onto `SceneGraph.gradeElevation` and read by the
      underground filter and the ground plane; it decouples the ground surface from the finished-floor-zero
      datum. Record the rejected alternatives (a per-floor or top-level grade; a stored per-edge exposure)
      and the deferred follow-up (per-edge / sloped-site / stepped-foundation exposure). Mirror ADR-0137's
      structure. Run the `humanizer` skill over the prose before committing.

- [ ] **Step 2: Commit the ADR**

```bash
git add docs/knowledge/decisions/ADR-0138-explicit-grade-elevation-field.md
git commit -m "docs: record ADR-0138 explicit grade elevation field"
```

- [ ] **Step 3: Knowledge curation** — refresh ADR-0131's follow-up note (grade half now landed) if the
      knowledge-curator flags it; otherwise note it as superseded in ADR-0138's references.

- [ ] **Step 4: pr-reviewer over the branch** — `/review` across `integration/local-staging..HEAD`;
      resolve any blockers. Confirm the RGB commit sequence (test -> feat -> refactor per cycle).

- [ ] **Step 5: Full gate chain (verify each exit code)** —
      `pnpm typecheck` (0); `pnpm lint` (0 new); `pnpm format:check` (ignore the pre-existing untracked
      `docs/brainstorm-prep/` + `docs/plans/` scratch failures only); `pnpm exec vitest run` (all pass);
      `pnpm build` (0); `pnpm schema:check` (0).

- [ ] **Step 6: Merge into the local integration branch (hooks ON, no `--no-verify`)**

```bash
git switch integration/local-staging
git merge --no-ff feat/explicit-grade-elevation-field \
  -m "Merge explicit grade elevation field (issue #410) into local integration staging"
```

- [ ] **Step 7: Bookkeeping** — append a PROGRESS.md entry (newest at bottom) for #410, and queue the
      per-edge / sloped-site exposure follow-up plus "close #410 on owner merge" in GITHUB-PENDING.md (do
      NOT run `gh` writes; GitHub is read-only). These ledgers are untracked; never `git add` them.

---

## Self-Review

- **Spec coverage:** the issue's primary ask ("explicit grade field so grade is data-driven rather than
  fixed at elevation 0") is covered by Tasks 1-4; the underground-filter coordination it names is Task 2;
  the floor-placement datum is intentionally untouched (grade is a separate datum). The "optional
  per-edge exposure" is explicitly deferred with a queued follow-up and recorded in ADR-0138.
- **Type consistency:** `gradeElevation` (the field), `DEFAULT_GRADE_ELEVATION_MM` (core default),
  `GRADE_ELEVATION_MM` (engine render default, retained), `resolveGradeElevation` (resolver),
  `addSiteGradeElevationMigration` (migration) are used identically across tasks.
- **Placeholders:** none; every code step shows the code.
