# Three-Dimensional Opening Fill Implementation Plan

> **For agentic workers:** This plan is executed by the project's main-thread red-green-blue cycle
> (`test-author` RED, `implementer` GREEN, `clean-code-reviewer` + `refactorer` BLUE), one cycle per
> task. The orchestrator commits from the main thread. Each task is `test:` then `feat:` then
> `refactor:` (an empty marker if the BLUE finds nothing); `docs:` and `test(e2e):` commits are
> rgb:audit-exempt. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Put a body into the void each opening cuts in the three-dimensional preview: a door gets a
flat leaf, a window gets a sash frame and a semi-transparent glass pane, a cased opening stays empty,
and the body carries the opening's entity id so openings become pickable.

**Architecture:** A pure `core/scene/opening-fill.ts` resolver dispatches on a new declarative
`scene3D.fill` element-type key and returns a list of axis-aligned box parts in the opening local
frame. A new `engine/scene/opening-fill-builder.ts` extrudes each part into a thin box placed through
`planToWorld`, in a `THREE.Group` that carries the opening id, and `build-scene` adds one fill group
per opening beside the wall and room geometry. Two new surface roles (`leaf`, `glass`) get their
appearance from a shared `role-appearance.ts` used by both material providers; glass is transparent.

**Tech stack:** TypeScript, Three.js (engine layer only), Vitest (Node geometry/scene tests),
Playwright `scene-webgl` project (pixel-approximate visual tier). Follows ADR-0081, the void slice
(ADR-0063), and the conventions of ADR-0045/0061/0062.

---

## Pre-flight

- [ ] **Install deps in the worktree** (fresh worktrees have no `node_modules`):

```bash
cd /Users/dan/workspace/vernacular.wt/three-dimensional-opening-fill
pnpm install --frozen-lockfile
```

- [ ] **Commit the spec, ADR, and this plan** as one `docs:` commit (rgb:audit-exempt):

```bash
git add docs/specs/2026-06-14-three-dimensional-opening-fill.md \
        docs/knowledge/decisions/ADR-0081-three-dimensional-opening-fill.md \
        docs/plans/2026-06-14-three-dimensional-opening-fill.md
git commit -m "docs: spec, ADR-0081, and plan for three-dimensional opening fill"
```

## File structure

- Create `core/scene/opening-fill.ts`: the pure fill resolver, the `OpeningFillPart`/`OpeningFillRole`
  types, the fill-dimension constants, and the per-kind generators. Mirrors `opening-void.ts`.
- Modify `core/registries/element-types.ts`: add `OpeningFillKind`, add `fill?: OpeningFillKind` to
  `Scene3DReference`, set `fill` on every opening type, bump `ELEMENT_TYPE_REGISTRY_VERSION` to `5`.
- Modify `core/index.ts`: export `openingFill`, `OpeningFillPart`, `OpeningFillRole`, `OpeningFillKind`.
- Create `engine/materials/role-appearance.ts`: `roleMaterialParameters(role)` returning the
  `MeshStandardMaterialParameters` per role, plus the color/opacity constants. Shared by both providers.
- Modify `engine/materials/material-provider.ts`: add `'leaf'` and `'glass'` to `SurfaceRole`.
- Modify `engine/materials/neutral-material-provider.ts` and `paint-material-provider.ts`: build
  role materials through `roleMaterialParameters`.
- Create `engine/scene/opening-fill-builder.ts`: `buildOpeningFill(node, materials, elementTypes?)`.
- Modify `engine/scene/build-scene.ts`: add an opening loop in `buildFloorGroup`.
- Modify `bridge/react/scene-harness-view.tsx`: add a window to `SHELL_FIXTURE`.
- Refresh `e2e/tests/__screenshots__/.../scene-shell-webgl-scene-webgl-darwin.png` once.

## Shared definitions (referenced by later tasks)

These are introduced in the tasks below; collected here so every task uses identical names.

```ts
// core/registries/element-types.ts
export type OpeningFillKind = 'door-leaf' | 'window-sash'
// Scene3DReference gains:  fill?: OpeningFillKind
```

```ts
// core/scene/opening-fill.ts
export type OpeningFillRole = 'leaf' | 'glass'
export interface OpeningFillExtent {
  readonly min: number
  readonly max: number
}
export interface OpeningFillPart {
  /** Which surface role paints this part. */
  readonly role: OpeningFillRole
  /** Extent along the wall (mm) in the opening local frame, the +x axis. */
  readonly along: OpeningFillExtent
  /** Extent in height above the finished-floor datum (mm), the +y axis. */
  readonly up: OpeningFillExtent
  /** Thickness across the wall (mm), centered on the wall centerline. */
  readonly thickness: number
}

export const LEAF_REVEAL_GAP_MM = 10
export const DOOR_LEAF_THICKNESS_MM = 44
export const SASH_FRAME_WIDTH_MM = 60
export const SASH_FRAME_THICKNESS_MM = 50
export const GLASS_THICKNESS_MM = 6
```

The fill-dimension constants are the single read points (per the spec section 3.2), the way
`DEFAULT_FLOOR_SLAB_THICKNESS_MM` and `MIN_OPENING_WIDTH_MM` already are in core.

---

## Task 1: The element type names the fill kind

**Files:**

- Modify: `core/registries/element-types.ts`
- Test: `core/registries/element-types.test.ts`

- [ ] **Step 1: Write the failing test.** Add cases to `element-types.test.ts`: bump the existing
      version assertion to `5`; assert every door-family opening type carries `scene3D.fill === 'door-leaf'`,
      every window-family type carries `scene3D.fill === 'window-sash'`, `cased-opening` has
      `scene3D.fill === undefined`, and the wall and stair types have `scene3D.fill === undefined`.

```ts
it('versions the registry at 5', () => {
  expect(ELEMENT_TYPE_REGISTRY_VERSION).toBe(5)
})

it('names the fill kind on each opening type, and omits it on cased openings and non-openings', () => {
  const fillOf = (id: string) => getEntry(builtinElementTypes, id)?.scene3D.fill
  expect(fillOf('single-swing-door')).toBe('door-leaf')
  expect(fillOf('double-swing-door')).toBe('door-leaf')
  expect(fillOf('pocket-door')).toBe('door-leaf')
  expect(fillOf('double-hung-window')).toBe('window-sash')
  expect(fillOf('casement-window')).toBe('window-sash')
  expect(fillOf('cased-opening')).toBeUndefined()
  expect(fillOf('straight-wall')).toBeUndefined()
  expect(fillOf('straight-stair')).toBeUndefined()
})
```

- [ ] **Step 2: Run, verify it fails** (`fill` is not on the type yet, version is 4):

```bash
pnpm exec vitest run core/registries/element-types.test.ts
```

Expected: FAIL (version 4 !== 5; `fill` undefined where door-leaf/window-sash expected).

- [ ] **Step 3: Minimal implementation.** In `element-types.ts`: add the kind type and the key, set
      the key on every opening type, bump the version.

```ts
export type VoidContourKind = 'rectangular'

/** The named body an opening renders in its void. Open to further variants additively. */
export type OpeningFillKind = 'door-leaf' | 'window-sash'

export interface Scene3DReference {
  builder: string
  voidContour?: VoidContourKind
  /** Names the opening's body (leaf, sash, glass), distinct from `voidContour` (the cut). */
  fill?: OpeningFillKind
}

export const ELEMENT_TYPE_REGISTRY_VERSION = 5
```

Then, on each opening element type, add `fill` beside `voidContour`: `fill: 'door-leaf'` on the
swing/slide/fold/pivot door types (`single-swing-door`, `double-swing-door`, `french-door`,
`dutch-door`, `pocket-door`, `bypass-door`, `sliding-glass-door`, `barn-door`, `bifold-door`,
`pivot-door`), `fill: 'window-sash'` on the window types (`double-hung-window`, `single-hung-window`,
`sliding-window`, `picture-window`, `casement-window`, `awning-window`, `hopper-window`,
`transom-window`, `sidelight-window`), and leave `cased-opening`, `straight-wall`, and
`straight-stair` without a `fill` key.

- [ ] **Step 4: Check for other version consumers** before relying on the bump:

```bash
grep -rn "ELEMENT_TYPE_REGISTRY_VERSION\|scene3D.fill" core engine editor storage app bridge \
  --include='*.ts' --include='*.tsx'
```

If any non-test code pins the version to 4 or snapshots the registry, update it. (The void slice's
3->4 bump had no other consumer; expect the same.)

- [ ] **Step 5: Run, verify it passes:**

```bash
pnpm exec vitest run core/registries/element-types.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit** `test:` then `feat:` (orchestrator splits the RED and GREEN into two commits):

```
test: require each opening type to name its fill kind
feat: name the door-leaf and window-sash fill on opening types
```

- [ ] **Step 7: BLUE.** clean-code-reviewer + refactorer; commit `refactor:` (empty marker if nothing).

---

## Task 2: The fill resolver authors a single door leaf

**Files:**

- Create: `core/scene/opening-fill.ts`
- Modify: `core/index.ts`
- Test: `core/scene/opening-fill.test.ts`

- [ ] **Step 1: Write the failing test.** A single-swing door node yields one `leaf` part inset by the
      reveal gap on all four sides, at the door-leaf thickness.

```ts
import { describe, expect, it } from 'vitest'
import { DOOR_LEAF_THICKNESS_MM, LEAF_REVEAL_GAP_MM, openingFill } from './opening-fill'
import type { OpeningSceneNode } from './scene-graph'

const doorNode: OpeningSceneNode = {
  id: 'opening:d',
  kind: 'opening',
  floorId: 'f',
  type: 'single-swing-door',
  center: { x: 1000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: 120,
  orientation: 'positive',
  hostWallId: 'south',
}

it('authors one inset leaf for a single door', () => {
  const parts = openingFill(doorNode)
  expect(parts).toHaveLength(1)
  const [leaf] = parts
  expect(leaf.role).toBe('leaf')
  expect(leaf.thickness).toBe(DOOR_LEAF_THICKNESS_MM)
  expect(leaf.along).toEqual({ min: -450 + LEAF_REVEAL_GAP_MM, max: 450 - LEAF_REVEAL_GAP_MM })
  expect(leaf.up).toEqual({ min: LEAF_REVEAL_GAP_MM, max: 2032 - LEAF_REVEAL_GAP_MM })
})
```

(`orientation`'s literal value must match the `OpeningOrientation` type; check `scene-graph.ts` and
use a valid member.)

- [ ] **Step 2: Run, verify it fails** (module missing):

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts
```

Expected: FAIL (cannot find `./opening-fill`).

- [ ] **Step 3: Minimal implementation.** Create `opening-fill.ts` with the types, constants, the
      resolver, and the door generator. Mirror `opening-void.ts`'s registry lookup.

```ts
import { builtinElementTypes, type ElementType } from '../registries/element-types'
import { getEntry, type Registry } from '../registries/registry'
import type { OpeningSceneNode } from './scene-graph'

export type OpeningFillRole = 'leaf' | 'glass'
export interface OpeningFillExtent {
  readonly min: number
  readonly max: number
}
export interface OpeningFillPart {
  readonly role: OpeningFillRole
  readonly along: OpeningFillExtent
  readonly up: OpeningFillExtent
  readonly thickness: number
}

export const LEAF_REVEAL_GAP_MM = 10
export const DOOR_LEAF_THICKNESS_MM = 44
export const SASH_FRAME_WIDTH_MM = 60
export const SASH_FRAME_THICKNESS_MM = 50
export const GLASS_THICKNESS_MM = 6

/**
 * Resolves an opening's three-dimensional body from its element type (spec section 3.1): the
 * fill-kind resolver seam. Geometry comes from the element type's `scene3D.fill`, so a new body is a
 * new `case` here, not a change in the builder that calls it. A node whose type is missing from the
 * registry, or whose type omits `fill`, yields no parts (a cased opening keeps its empty void).
 */
export function openingFill(
  node: OpeningSceneNode,
  elementTypes: Registry<ElementType> = builtinElementTypes,
): OpeningFillPart[] {
  const entry = getEntry(elementTypes, node.type)
  switch (entry?.scene3D.fill) {
    case 'door-leaf':
      return doorLeafParts(node, entry.opening?.double ?? false)
    // 'window-sash' lands in Task 4; further kinds add a case here.
    default:
      return []
  }
}

function doorLeafParts(node: OpeningSceneNode, _double: boolean): OpeningFillPart[] {
  const halfWidth = node.width / 2
  const along = { min: -halfWidth + LEAF_REVEAL_GAP_MM, max: halfWidth - LEAF_REVEAL_GAP_MM }
  const up = {
    min: node.sillHeight + LEAF_REVEAL_GAP_MM,
    max: node.sillHeight + node.height - LEAF_REVEAL_GAP_MM,
  }
  return [{ role: 'leaf', along, up, thickness: DOOR_LEAF_THICKNESS_MM }]
}
```

Add to `core/index.ts` beside the `opening-void` export:

```ts
export { openingFill } from './scene/opening-fill'
export type { OpeningFillPart, OpeningFillRole, OpeningFillExtent } from './scene/opening-fill'
export type { OpeningFillKind } from './registries/element-types'
```

- [ ] **Step 4: Run, verify it passes:**

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** `test:` then `feat:`:

```
test: require a single door to fill its void with one inset leaf
feat: author a single inset door leaf from the element type
```

- [ ] **Step 6: BLUE.** clean-code-reviewer + refactorer; `refactor:` (marker if nothing). Note the
      `_double` parameter is unused until Task 3; the reviewer may prefer it added in Task 3 instead.
      Either is fine; if removed here, Task 3 reintroduces it.

---

## Task 3: A double door fills with two leaves

**Files:**

- Modify: `core/scene/opening-fill.ts`
- Test: `core/scene/opening-fill.test.ts`

- [ ] **Step 1: Write the failing test.** A `double-swing-door` node yields two `leaf` parts splitting
      the inset width at the opening center, meeting at 0.

```ts
const doubleDoorNode: OpeningSceneNode = { ...doorNode, type: 'double-swing-door', width: 1626 }

it('splits a double door into two leaves meeting at the center', () => {
  const parts = openingFill(doubleDoorNode)
  expect(parts).toHaveLength(2)
  expect(parts.every((p) => p.role === 'leaf')).toBe(true)
  expect(parts[0].along).toEqual({ min: -813 + LEAF_REVEAL_GAP_MM, max: 0 })
  expect(parts[1].along).toEqual({ min: 0, max: 813 - LEAF_REVEAL_GAP_MM })
  // both leaves keep the full inset height
  expect(parts[0].up).toEqual(parts[1].up)
})
```

- [ ] **Step 2: Run, verify it fails** (only one leaf today):

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts -t 'double door'
```

Expected: FAIL (length 1, not 2).

- [ ] **Step 3: Minimal implementation.** Use the `double` flag in `doorLeafParts`:

```ts
function doorLeafParts(node: OpeningSceneNode, double: boolean): OpeningFillPart[] {
  const halfWidth = node.width / 2
  const up = {
    min: node.sillHeight + LEAF_REVEAL_GAP_MM,
    max: node.sillHeight + node.height - LEAF_REVEAL_GAP_MM,
  }
  const leftEdge = -halfWidth + LEAF_REVEAL_GAP_MM
  const rightEdge = halfWidth - LEAF_REVEAL_GAP_MM
  const leaf = (along: OpeningFillExtent): OpeningFillPart => ({
    role: 'leaf',
    along,
    up,
    thickness: DOOR_LEAF_THICKNESS_MM,
  })
  if (double) {
    return [leaf({ min: leftEdge, max: 0 }), leaf({ min: 0, max: rightEdge })]
  }
  return [leaf({ min: leftEdge, max: rightEdge })]
}
```

- [ ] **Step 4: Run, verify it passes** (whole file, to keep Task 2 green):

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** `test:` then `feat:`:

```
test: require a double door to split into two leaves at the center
feat: split a double door into two leaves
```

- [ ] **Step 6: BLUE.** `refactor:` (marker if nothing).

---

## Task 4: A window fills with a sash frame and glass

**Files:**

- Modify: `core/scene/opening-fill.ts`
- Test: `core/scene/opening-fill.test.ts`

- [ ] **Step 1: Write the failing test.** A `double-hung-window` node yields four `leaf` frame bars
      (head, sill, two jambs) forming a band of `SASH_FRAME_WIDTH_MM` inside the void, plus one `glass`
      pane filling the area inside the band.

```ts
const windowNode: OpeningSceneNode = {
  ...doorNode,
  type: 'double-hung-window',
  width: 900,
  height: 1200,
  sillHeight: 900,
}

it('frames a window with four sash bars and one glass pane', () => {
  const parts = openingFill(windowNode)
  const leaves = parts.filter((p) => p.role === 'leaf')
  const glass = parts.filter((p) => p.role === 'glass')
  expect(leaves).toHaveLength(4)
  expect(glass).toHaveLength(1)

  const top = 900 + 1200 // sill + height = 2100
  const fw = SASH_FRAME_WIDTH_MM
  // glass is inset by the frame width on all four sides
  expect(glass[0].up).toEqual({ min: 900 + fw, max: top - fw })
  expect(glass[0].along).toEqual({ min: -450 + fw, max: 450 - fw })
  expect(glass[0].thickness).toBe(GLASS_THICKNESS_MM)
  // the head bar spans the full width at the top band
  expect(
    leaves.some(
      (b) =>
        b.up.min === top - fw && b.up.max === top && b.along.min === -450 && b.along.max === 450,
    ),
  ).toBe(true)
})
```

- [ ] **Step 2: Run, verify it fails** (window yields no parts yet):

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts -t 'window'
```

Expected: FAIL (0 parts).

- [ ] **Step 3: Minimal implementation.** Add the `'window-sash'` case and the generator:

```ts
    case 'window-sash':
      return windowSashParts(node)
```

```ts
function windowSashParts(node: OpeningSceneNode): OpeningFillPart[] {
  const halfWidth = node.width / 2
  const sill = node.sillHeight
  const top = node.sillHeight + node.height
  const fw = SASH_FRAME_WIDTH_MM
  const bar = (along: OpeningFillExtent, up: OpeningFillExtent): OpeningFillPart => ({
    role: 'leaf',
    along,
    up,
    thickness: SASH_FRAME_THICKNESS_MM,
  })
  const innerUp = { min: sill + fw, max: top - fw }
  const frame: OpeningFillPart[] = [
    bar({ min: -halfWidth, max: halfWidth }, { min: top - fw, max: top }), // head
    bar({ min: -halfWidth, max: halfWidth }, { min: sill, max: sill + fw }), // sill
    bar({ min: -halfWidth, max: -halfWidth + fw }, innerUp), // left jamb
    bar({ min: halfWidth - fw, max: halfWidth }, innerUp), // right jamb
  ]
  const glass: OpeningFillPart = {
    role: 'glass',
    along: { min: -halfWidth + fw, max: halfWidth - fw },
    up: innerUp,
    thickness: GLASS_THICKNESS_MM,
  }
  return [...frame, glass]
}
```

(All built-in window types satisfy `width > 2*fw` and `height > 2*fw`; a degenerate clamp is a recorded
seam, not built here.)

- [ ] **Step 4: Run, verify it passes:**

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** `test:` then `feat:`:

```
test: require a window to fill with a sash frame and a glass pane
feat: frame a window with four sash bars and a glass pane
```

- [ ] **Step 6: BLUE.** `refactor:` (marker if nothing).

---

## Task 5: A cased or unknown opening fills with nothing

**Files:**

- Test: `core/scene/opening-fill.test.ts`

- [ ] **Step 1: Write the failing test.** A `cased-opening` node and a node whose type is absent from
      the registry both yield no parts.

```ts
it('renders no body for a cased opening or an unknown type', () => {
  expect(openingFill({ ...doorNode, type: 'cased-opening' })).toEqual([])
  expect(openingFill({ ...doorNode, type: 'not-a-real-type' })).toEqual([])
})
```

- [ ] **Step 2: Run, verify it passes already** (the `default` case returns `[]`). This is a
      characterization test that pins the empty-fill contract. If it passes on arrival, commit it alone as
      a `test:` (rgb:audit permits an unconsumed characterization RED, as the void slice's winding test was).

```bash
pnpm exec vitest run core/scene/opening-fill.test.ts -t 'no body'
```

Expected: PASS.

- [ ] **Step 3: Commit** `test:` only (no feat needed; the behavior is already correct):

```
test: pin that a cased or unknown opening renders no body
```

- [ ] **Step 4: BLUE.** `refactor:` marker (keeps the cycle shape) if the reviewer wants the resolver's
      comment clarified; otherwise an empty marker.

---

## Task 6: Two new surface roles, with transparent glass

**Files:**

- Create: `engine/materials/role-appearance.ts`
- Modify: `engine/materials/material-provider.ts`
- Modify: `engine/materials/neutral-material-provider.ts`
- Modify: `engine/materials/paint-material-provider.ts`
- Test: `engine/materials/neutral-material-provider.test.ts`, `engine/materials/paint-material-provider.test.ts`

- [ ] **Step 1: Write the failing test.** The neutral provider gives `glass` a transparent,
      depth-write-disabled, double-sided material named `glass`, and `leaf` an opaque double-sided material
      named `leaf`. The paint provider, with no paint, returns the same transparent glass.

```ts
// neutral-material-provider.test.ts
import * as THREE from 'three'
it('makes glass transparent and leaf opaque', () => {
  const provider = new NeutralMaterialProvider()
  const glass = provider.material('glass') as THREE.MeshStandardMaterial
  expect(glass.name).toBe('glass')
  expect(glass.transparent).toBe(true)
  expect(glass.opacity).toBeLessThan(1)
  expect(glass.depthWrite).toBe(false)
  expect(glass.side).toBe(THREE.DoubleSide)
  const leaf = provider.material('leaf') as THREE.MeshStandardMaterial
  expect(leaf.name).toBe('leaf')
  expect(leaf.transparent).toBe(false)
  expect(leaf.side).toBe(THREE.DoubleSide)
})

// paint-material-provider.test.ts
it('returns transparent glass for an unpainted glass surface', () => {
  const provider = new PaintMaterialProvider({ lightColor: { r: 1, g: 1, b: 1 } })
  const glass = provider.material('glass') as THREE.MeshStandardMaterial
  expect(glass.transparent).toBe(true)
  expect(glass.depthWrite).toBe(false)
})
```

- [ ] **Step 2: Run, verify it fails** (`'glass'`/`'leaf'` not in `SurfaceRole`; providers make one
      flat opaque material):

```bash
pnpm exec vitest run engine/materials
```

Expected: FAIL (type error on the role literal, or transparent !== true).

- [ ] **Step 3: Minimal implementation.** Add the roles and the shared appearance helper.

```ts
// material-provider.ts
export type SurfaceRole =
  | 'interiorFace'
  | 'exteriorFace'
  | 'reveal'
  | 'top'
  | 'base'
  | 'leaf'
  | 'glass'
```

```ts
// role-appearance.ts
import * as THREE from 'three'
import type { SurfaceRole } from './material-provider'

/** A light warm gray shared by every wall and room surface role until painting assigns colors. */
export const NEUTRAL_COLOR = 0xd8d4cc
/** A door leaf reads slightly darker than the wall so it is legible set into the opening. */
export const LEAF_COLOR = 0xb9b0a2
/** A faint blue-gray so the glass reads as glazing. */
export const GLASS_COLOR = 0xbcd2da
/** Low enough that the room reads through the window. */
export const GLASS_OPACITY = 0.3

/**
 * The standard-material parameters for a surface role. Glass is transparent and writes no depth so it
 * blends without occluding the room behind it; the fill parts are thin boxes whose face orientation
 * depends on the opening normal sign, so leaf and glass render double-sided rather than pinning a
 * per-opening winding.
 */
export function roleMaterialParameters(role: SurfaceRole): THREE.MeshStandardMaterialParameters {
  if (role === 'glass') {
    return {
      color: GLASS_COLOR,
      name: role,
      transparent: true,
      opacity: GLASS_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }
  }
  if (role === 'leaf') {
    return { color: LEAF_COLOR, name: role, side: THREE.DoubleSide }
  }
  return { color: NEUTRAL_COLOR, name: role }
}
```

Rewire `NeutralMaterialProvider.material` to `new THREE.MeshStandardMaterial(roleMaterialParameters(role))`
(drop its local `NEUTRAL_COLOR`, import from `role-appearance`). Rewire
`PaintMaterialProvider.neutralMaterial` the same way (its painted path stays opaque and unchanged).

- [ ] **Step 4: Run, verify it passes** (whole materials dir, to keep the existing role tests green):

```bash
pnpm exec vitest run engine/materials
```

Expected: PASS.

- [ ] **Step 5: Commit** `test:` then `feat:`:

```
test: require leaf and glass surface roles with transparent glass
feat: add leaf and glass surface roles via a shared role appearance
```

- [ ] **Step 6: BLUE.** clean-code-reviewer + refactorer; confirm both providers route through
      `roleMaterialParameters` with no duplicated color/opacity literals; `refactor:` (marker if nothing).

---

## Task 7: The engine builds a placed box per fill part

**Files:**

- Create: `engine/scene/opening-fill-builder.ts`
- Test: `engine/scene/opening-fill-builder.test.ts`

- [ ] **Step 1: Write the failing test.** `buildOpeningFill` returns a group carrying the opening id;
      for a single door it has one child mesh whose geometry bounding box matches the leaf's world extent.

```ts
import * as THREE from 'three'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { buildOpeningFill } from './opening-fill-builder'
// doorNode as in core/scene/opening-fill.test.ts: center (1000,0), along (1,0), normal (0,1),
// width 900, height 2032, sillHeight 0, hostThickness 120, type single-swing-door.

it('builds a group carrying the opening id with one placed leaf box', () => {
  const group = buildOpeningFill(doorNode, new NeutralMaterialProvider())
  expect(group.userData.entityId).toBe('opening:d')
  const meshes = group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
  expect(meshes).toHaveLength(1)
  meshes[0].geometry.computeBoundingBox()
  const box = meshes[0].geometry.boundingBox as THREE.Box3
  // along (1,0) => world X; up => world Y; across (normal 0,1) => world Z; center.x 1000
  // along extent [-440,440] + center.x 1000 => X in [560,1440]
  expect(box.min.x).toBeCloseTo(560)
  expect(box.max.x).toBeCloseTo(1440)
  // up extent [10, 2022] => Y
  expect(box.min.y).toBeCloseTo(10)
  expect(box.max.y).toBeCloseTo(2022)
  // thickness 44 centered on centerline along normal (0,1) => Z in [-22,22]
  expect(box.min.z).toBeCloseTo(-22)
  expect(box.max.z).toBeCloseTo(22)
})
```

- [ ] **Step 2: Run, verify it fails** (module missing):

```bash
pnpm exec vitest run engine/scene/opening-fill-builder.test.ts
```

Expected: FAIL (cannot find `./opening-fill-builder`).

- [ ] **Step 3: Minimal implementation.** Build each part as a thin box through `planToWorld`.

```ts
import * as THREE from 'three'
import {
  builtinElementTypes,
  openingFill,
  planToWorld,
  type ElementType,
  type OpeningFillPart,
  type OpeningSceneNode,
  type Point,
  type Registry,
} from '../../core'
import type { MaterialProvider } from '../materials/material-provider'

const COMPONENTS_PER_VERTEX = 3

/**
 * Builds an opening's three-dimensional body as a group of thin boxes, one per fill part, placed in
 * world space through `planToWorld`. The group carries the opening's entity id, so a raycaster walks
 * up from a leaf or sash to select the opening. An opening with no fill (a cased opening) yields an
 * empty group.
 */
export function buildOpeningFill(
  node: OpeningSceneNode,
  materials: MaterialProvider,
  elementTypes: Registry<ElementType> = builtinElementTypes,
): THREE.Group {
  const group = new THREE.Group()
  group.name = node.id
  group.userData.entityId = node.id
  for (const part of openingFill(node, elementTypes)) {
    group.add(buildPartMesh(node, part, materials))
  }
  return group
}

function buildPartMesh(
  node: OpeningSceneNode,
  part: OpeningFillPart,
  materials: MaterialProvider,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(boxPositions(node, part), COMPONENTS_PER_VERTEX),
  )
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, materials.material(part.role))
}

/** Maps an opening-local point (along, up, across-centerline offset) to world space. */
function localToWorld(node: OpeningSceneNode, along: number, up: number, across: number) {
  const planPoint: Point = {
    x: node.center.x + along * node.along.x + across * node.normal.x,
    y: node.center.y + along * node.along.y + across * node.normal.y,
  }
  return planToWorld(planPoint, up)
}

/** The 6 faces (12 triangles) of one fill-part box, centered on the wall centerline across. */
function boxPositions(node: OpeningSceneNode, part: OpeningFillPart): number[] {
  const half = part.thickness / 2
  const a = [part.along.min, part.along.max]
  const u = [part.up.min, part.up.max]
  const c = [-half, half]
  // 8 corners indexed by (ai*4 + ui*2 + ci)
  const corner = (ai: number, ui: number, ci: number) => localToWorld(node, a[ai], u[ui], c[ci])
  const v = [
    corner(0, 0, 0),
    corner(0, 0, 1),
    corner(0, 1, 0),
    corner(0, 1, 1),
    corner(1, 0, 0),
    corner(1, 0, 1),
    corner(1, 1, 0),
    corner(1, 1, 1),
  ]
  // Six quads (winding is irrelevant: leaf and glass render DoubleSide).
  const quads: [number, number, number, number][] = [
    [0, 1, 3, 2], // along.min face
    [4, 6, 7, 5], // along.max face
    [0, 4, 5, 1], // up.min face
    [2, 3, 7, 6], // up.max face
    [0, 2, 6, 4], // across.min face
    [1, 5, 7, 3], // across.max face
  ]
  const positions: number[] = []
  for (const [p, q, r, s] of quads) {
    for (const idx of [p, q, r, p, r, s]) {
      positions.push(v[idx].x, v[idx].y, v[idx].z)
    }
  }
  return positions
}
```

(If `Point` is not exported from the core barrel, import the extent from the local part instead and
build the plan point inline with `node.center` typed as `Point` already on the node.)

- [ ] **Step 4: Run, verify it passes:**

```bash
pnpm exec vitest run engine/scene/opening-fill-builder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** `test:` then `feat:`:

```
test: require the opening fill to build a placed leaf box carrying the opening id
feat: build opening fill parts as placed boxes through planToWorld
```

- [ ] **Step 6: BLUE.** clean-code-reviewer + refactorer. Watch `max-lines-per-function` on
      `boxPositions`; if flagged, extract the quad table to a module constant. `refactor:` (marker if none).

---

## Task 8: Each fill part takes its role's material

**Files:**

- Test: `engine/scene/opening-fill-builder.test.ts`

- [ ] **Step 1: Write the failing test.** A window's children include four meshes with a `leaf`-named
      material and one with a `glass`-named transparent material.

```ts
it('paints sash bars with the leaf material and the pane with the glass material', () => {
  const group = buildOpeningFill(windowNode, new NeutralMaterialProvider())
  const meshes = group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
  const names = meshes.map((m) => (m.material as THREE.Material).name)
  expect(names.filter((n) => n === 'leaf')).toHaveLength(4)
  expect(names.filter((n) => n === 'glass')).toHaveLength(1)
  const glassMesh = meshes.find((m) => (m.material as THREE.Material).name === 'glass')
  expect((glassMesh!.material as THREE.MeshStandardMaterial).transparent).toBe(true)
})
```

- [ ] **Step 2: Run, verify it passes already** (Task 7's builder maps `part.role` to
      `materials.material(part.role)`, so this holds on arrival). Characterization test pinning the
      role-to-material mapping for windows; commit `test:` alone if green on arrival.

```bash
pnpm exec vitest run engine/scene/opening-fill-builder.test.ts -t 'glass material'
```

Expected: PASS.

- [ ] **Step 3: Commit** `test:` (and `feat:` only if Task 7 did not already satisfy it; otherwise the
      characterization `test:` stands alone):

```
test: pin sash bars to the leaf material and the pane to glass
```

- [ ] **Step 4: BLUE.** `refactor:` marker.

---

## Task 9: The scene adds a fill group per opening

**Files:**

- Modify: `engine/scene/build-scene.ts`
- Test: `engine/scene/build-scene.test.ts`

- [ ] **Step 1: Write the failing test.** A floor graph with a door opening produces a floor group that
      contains a child whose `userData.entityId` equals the opening node id (the fill group).

```ts
it('adds a fill group carrying the opening id under the floor group', () => {
  const root = buildScene(graphWithDoor) // a floor with one wall hosting a single-swing-door opening
  const floorGroup = root.children[0]
  const openingId = graphWithDoor.openings[0].id
  const fill = floorGroup.children.find((c) => c.userData.entityId === openingId)
  expect(fill).toBeDefined()
  expect(fill!.children.length).toBeGreaterThan(0) // the leaf box
})
```

(Reuse or extend an existing `build-scene.test.ts` opening fixture; the openings already derive into
`graph.openings` with a `hostWallId`.)

- [ ] **Step 2: Run, verify it fails** (no fill group is added yet):

```bash
pnpm exec vitest run engine/scene/build-scene.test.ts -t 'fill group'
```

Expected: FAIL (no child with the opening id).

- [ ] **Step 3: Minimal implementation.** In `buildFloorGroup`, after the room loop, add the opening
      loop (the `floorOpenings` array already exists):

```ts
// import { buildOpeningFill } from './opening-fill-builder'
for (const opening of floorOpenings) {
  group.add(buildOpeningFill(opening, materials))
}
```

- [ ] **Step 4: Run, verify it passes** (whole build-scene file):

```bash
pnpm exec vitest run engine/scene/build-scene.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** `test:` then `feat:`:

```
test: require the scene to add a fill group per opening
feat: add an opening fill group to each floor group
```

- [ ] **Step 6: BLUE.** `refactor:` (marker if nothing).

---

## Task 10: Picking a leaf selects the opening

**Files:**

- Test: `engine/scene/pick-entity.test.ts`

- [ ] **Step 1: Inspect `pick-entity.test.ts`** for the existing raycast setup (how it builds a scene
      and casts a ray to assert a returned entity id). Mirror it.

- [ ] **Step 2: Write the failing-or-characterizing test.** A ray that strikes a door's leaf returns
      the opening's entity id, not the wall's. Aim the ray along the wall normal at the opening center,
      at a height inside the leaf.

```ts
it('returns the opening id when the ray hits its leaf', () => {
  const root = buildScene(graphWithDoor)
  const opening = graphWithDoor.openings[0]
  // cast a ray from outside the wall, along -normal, through the opening center at mid-leaf height
  const id = pickEntityIdAt(root, rayThroughOpeningCenter(opening))
  expect(id).toBe(opening.id)
})
```

If the existing `pickEntityIdAt` signature differs (camera + NDC vs a ray), use its actual shape; the
assertion is the same (the opening id, not the wall id). This is the headline selection behavior the
void slice deferred. If, after inspecting the harness, a faithful ray setup is heavy, fold this proof
into the Task 9 scene-tree assertion (entity id on the group) and drop this task; do not write a
brittle test.

- [ ] **Step 3: Run, verify it passes** (the entity id is on the group from Task 9; `pickEntityIdAt`
      already walks up to the nearest `userData.entityId`):

```bash
pnpm exec vitest run engine/scene/pick-entity.test.ts -t 'opening id'
```

Expected: PASS (characterization), or FAIL then fixed if pick needs the group included.

- [ ] **Step 4: Commit** `test:` (characterization) or `test:`+`feat:` if a pick change was needed:

```
test: pin that picking a door leaf selects the opening
```

- [ ] **Step 5: BLUE.** `refactor:` marker.

---

## Task 11: Visual tier (rgb:audit-exempt)

**Files:**

- Modify: `bridge/react/scene-harness-view.tsx`
- Refresh: the `scene-shell-webgl` darwin baseline PNG

- [ ] **Step 1: Add a window to `SHELL_FIXTURE`.** Mirror `SHELL_DOOR`. Put a double-hung window on the
      east wall (which runs from `(SHELL_WIDTH_X, 0)` to `(SHELL_WIDTH_X, SHELL_DEPTH_Z)`):

```ts
const SHELL_WINDOW: OpeningSceneNode = {
  id: 'opening:east-window',
  kind: 'opening',
  floorId: SHELL_DOOR.floorId,
  type: 'double-hung-window',
  hostWallId: 'east',
  center: { x: SHELL_WIDTH_X, y: SHELL_DEPTH_Z / 2 },
  along: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  width: 1000,
  height: 1200,
  sillHeight: 900,
  hostThickness: SHELL_THICKNESS,
  orientation: SHELL_DOOR.orientation,
}
```

Add it to the fixture's `openings`: `openings: [SHELL_DOOR, SHELL_WINDOW]`. Confirm `along`/`normal`
match `SHELL_DOOR`'s axis convention (read `SHELL_DOOR` lines 92-100 and mirror the sign choice for a
wall running in +y).

- [ ] **Step 2: Rebuild and refresh the baseline.** The scene-webgl spec self-skips without WebGL2 and
      updates within tolerance with `-u`; force a pixel-exact refresh:

```bash
pnpm build
pnpm exec playwright test --project=scene-webgl scene-visual-regression --update-snapshots=all
```

- [ ] **Step 3: Eyeball the refreshed PNG** to confirm the south door now shows a leaf and the east
      wall shows a glazed window with a visible sash frame, the room reading through the glass.

- [ ] **Step 4: Commit** `test(e2e):` (rgb:audit-exempt):

```
test(e2e): show the filled door and glazed window in the scene baseline
```

---

## Final gate

- [ ] Run the full local gate from the worktree:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build
pnpm rgb:audit   # must be clean over origin/main..HEAD
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=scene-webgl
```

- [ ] Confirm `rgb:audit` reports a clean test->feat->refactor sequence over `origin/main..HEAD`
      (the `docs:`, `test:`-only characterization, and `test(e2e):` commits are exempt).
- [ ] Real commit times (no windowing).

## Self-review (done while writing this plan)

- **Spec coverage:** fill key (Task 1), door leaf single + double (Tasks 2-3), window sash + glass
  (Task 4), cased/empty (Task 5), leaf/glass roles + transparent glass (Task 6), placed box builder
  (Task 7), role-to-material (Task 8), per-opening scene wiring (Task 9), opening pickability (Task 10),
  visual tier (Task 11). Every spec section maps to a task.
- **Type consistency:** `OpeningFillPart { role, along, up, thickness }`, `OpeningFillExtent {min,max}`,
  `OpeningFillKind 'door-leaf'|'window-sash'`, `openingFill(node, elementTypes?)`,
  `buildOpeningFill(node, materials, elementTypes?)`, `roleMaterialParameters(role)` are used
  identically across tasks.
- **No placeholders:** every code step shows the code. The two heuristic checks (Task 1 step 4 grep,
  Task 7 step 3 `Point` export note, Task 10 setup-shape note) are guarded with the concrete fallback.
