# Three-Dimensional Painted Preview Implementation Plan

> **For agentic workers:** Main-thread red-green-blue with the role-separated subagents; each cycle test -> feat -> refactor; the main thread commits. Spec `docs/specs/2026-06-13-three-dimensional-painted-preview.md`, ADR-0067. Delivered as 7a (floor and ceiling paint, this plan's Tasks 1-4) then 7b (wall-face paint, Task 5+); 7a and 7b are separate pull requests.

**Goal:** Render assigned surface paint on the three-dimensional shell: floor and ceiling in 7a, wall faces in 7b.

**Architecture:** Widen the material seam from `material(role)` to `material(role, ref?)` (additive: existing calls render neutral, paintable surfaces pass a `SurfaceRef`). The paint provider, constructed with the project paint store, resolves a `SurfaceRef` to its paint color via `resolveSurfacePaint`/`surfaceKey` and sets the albedo from the treatment's sRGB hex; the lights still carry the color temperature (ADR-0065), so paint shows under the illuminant. The builders tag paintable material groups with their `SurfaceRef`. Paint is threaded as the project paint store, read reactively in the bridge.

**Tech Stack:** TypeScript, Three.js (engine only), React Three Fiber (bridge glue), Vitest (Node), Playwright (`scene-webgl`).

---

## Conventions

RED `test:` (test-author), GREEN `feat:` (implementer), BLUE `refactor:` (reviewer then refactorer; empty marker if none). Exact allowed files per subagent; main owns barrels. Plain commits, no em-dash, Conventional Commits. Full `pnpm test` after each GREEN. Watch max-params (the widened `material(role, ref?)` is 2 params, fine), max-lines-per-function (40), no-magic-numbers.

## File structure (7a)

Modify: `engine/materials/material-provider.ts` (widen `material` signature), `engine/materials/neutral-material-provider.ts` (ignore ref), `engine/materials/paint-material-provider.ts` (resolve paint), `engine/scene/room-builder.ts` (tag floor top + ceiling refs), `bridge/react/framed-scene.ts` (accept paint), `bridge/react/webgpu-scene-view.tsx` (read + pass paint), `app/app.tsx` + `bridge/react/scene-harness-view.tsx` (optional paint fixture for the baseline). Create: `bridge/react/use-project-paint.ts`, a painted baseline snapshot.

---

## Task 0: Docs

- [ ] Commit spec + ADR-0067 + this plan: `docs: spec, ADR-0067, and plan for the three-dimensional painted preview`.
- [ ] Flip ROADMAP "Painted 3D preview" row (line ~119) to `| Painted 3D preview ... | ADR-0067 | in progress |`; commit `docs: mark painted 3D preview in progress in the roadmap`.
- [ ] `pnpm knowledge:index`.

---

## Task 1 (Cycle 1): Widen the seam; paint provider resolves a painted ref (engine)

**Files:** `engine/materials/material-provider.ts`, `engine/materials/neutral-material-provider.ts`, `engine/materials/paint-material-provider.ts`, `engine/materials/paint-material-provider.test.ts`.

- [ ] **RED** (`test-author`; file `engine/materials/paint-material-provider.test.ts`, extend it). `PaintMaterialProvider` is now constructed with `{ lightColor, paint }` where `paint` is a `Record<string, SurfaceTreatment>` (the project paint store; default `{}`). `material(role, ref?)`: with a `ref` whose `surfaceKey(ref)` is in `paint`, the returned `MeshStandardMaterial`'s `color` equals `new THREE.Color(treatment.color.srgbHex)`; with no `ref`, or a `ref` not in `paint`, it returns the neutral albedo (unchanged). Build the paint store with the core helpers:

```ts
import { colorFromHex, solidTreatment, surfaceKey } from '../../core'

const FLOOR_REF = { kind: 'floor', floorId: 'demo' } as const
const PAINT_HEX = '#3366cc'
const paint = { [surfaceKey(FLOOR_REF)]: solidTreatment(colorFromHex(PAINT_HEX), 'matte') }

it('paints a surface whose ref is in the paint store', () => {
  const provider = new PaintMaterialProvider({ lightColor: { r: 1, g: 1, b: 1 }, paint })
  const material = provider.material('top', FLOOR_REF) as THREE.MeshStandardMaterial
  expect(material.color.equals(new THREE.Color(PAINT_HEX))).toBe(true)
})

it('keeps the neutral albedo for a surface with no ref', () => {
  const provider = new PaintMaterialProvider({ lightColor: { r: 1, g: 1, b: 1 }, paint })
  const material = provider.material('top') as THREE.MeshStandardMaterial
  expect(material.color.equals(new THREE.Color(PAINT_HEX))).toBe(false)
})
```

(The three existing PaintMaterialProvider tests must keep passing; the test-author updates their constructor calls to `{ lightColor: LIGHT_COLOR, paint: {} }` if the `paint` field is required, or leaves them if it defaults. Prefer defaulting `paint` to `{}` so the existing `{ lightColor }` calls still compile.) Confirm the new tests FAIL. Commit `test: the paint provider resolves a painted surface ref to its color`.

- [ ] **GREEN** (`implementer`; the four files above). In `material-provider.ts`, widen the interface: `material(role: SurfaceRole, ref?: SurfaceRef): THREE.Material` (import `type { SurfaceRef } from '../../core'`). In `neutral-material-provider.ts`, accept the optional `ref` and ignore it (role-keyed cache unchanged). In `paint-material-provider.ts`: add `paint?: Record<string, SurfaceTreatment>` to `PaintMaterialOptions` (default `{}`); in `material(role, ref?)`, if `ref` is set and `paint[surfaceKey(ref)]` exists, return a cached (keyed by `surfaceKey`) `MeshStandardMaterial` whose `color` is `new THREE.Color(treatment.color.srgbHex)` and `name` is the role; otherwise the existing neutral role material. Import `surfaceKey`, `type SurfaceRef`, `type SurfaceTreatment` from `../../core`. Run the test + typecheck + the full `pnpm test` (the wall/room builders call `material(role)` with no ref, still compile). Commit `feat: widen the material seam to a surface identity and resolve painted refs`.

- [ ] **BLUE**: reviewer then refactor/marker.

---

## Task 2 (Cycle 2): The room builder tags the floor and ceiling (engine)

**Files:** `engine/scene/room-builder.ts`, `engine/scene/room-builder.test.ts`.

- [ ] **RED** (`test-author`; extend `room-builder.test.ts`). With a `PaintMaterialProvider` painting `{ kind: 'floor', floorId }`, `buildRoomShell(roomNode, provider)`'s floor-slab top-cap mesh material is the paint color; with `{ kind: 'ceiling', floorId }`, the ceiling mesh material is the paint color. Read the floor/ceiling meshes from the built group (by the existing role material-group or mesh structure the room-builder test already navigates). The `floorId` is `roomNode.floorId`. Confirm FAIL (the builder passes no ref yet, so the meshes are neutral). Commit `test: the room builder paints the floor and ceiling from the paint store`.

- [ ] **GREEN** (`implementer`; `engine/scene/room-builder.ts`). At the two `materials.material(...)` call sites, pass the surface ref: the floor-slab **top cap** section gets `materials.material('top', { kind: 'floor', floorId })` (the other slab sections keep `material(role)` with no ref); the ceiling gets `materials.material('base', { kind: 'ceiling', floorId })`. `floorId` is the room node's `floorId`. Run the test + full `pnpm test`. Commit `feat: tag the room floor and ceiling with their paint surface refs`.

- [ ] **BLUE**: reviewer then refactor/marker.

---

## Task 3 (Cycle 3): Thread the paint store into the build (bridge)

**Files:** `bridge/react/framed-scene.ts`, `bridge/react/framed-scene.test.ts`, `bridge/react/use-project-paint.ts`, `bridge/react/webgpu-scene-view.tsx`, `bridge/index.ts` (if exporting the hook).

- [ ] **RED** (`test-author`; extend `framed-scene.test.ts`). `buildFramedScene(graph, paint?)` accepts a paint store; when it paints a room's floor ref, the built floor mesh carries the paint color. (Reuse the shared `graph` plus a room; or assert structurally that a painted floor mesh's color matches. If the existing fixture has no room, add a minimal room to a local graph for this test.) Confirm FAIL (`buildFramedScene` ignores paint). Commit `test: the framed scene paints surfaces from the project paint store`.

- [ ] **GREEN** (`implementer`; `bridge/react/framed-scene.ts`). `buildFramedScene(graph: SceneGraph, paint: Record<string, SurfaceTreatment> = {})`; construct `new PaintMaterialProvider({ lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K), paint })`. Run the test + full `pnpm test` (other `buildFramedScene(graph)` callers default paint to `{}`, unaffected). Commit `feat: thread the project paint store into the framed scene`.

- [ ] **GREEN (glue, same cycle)**: create `bridge/react/use-project-paint.ts`: `useProjectPaint(): Record<string, SurfaceTreatment>` via `useSyncExternalStore(session.subscribe, () => session.getProject().paint ?? EMPTY)` (a stable empty default). In `webgpu-scene-view.tsx`, read `const paint = useProjectPaint()` and pass it into the `buildFramedScene` memo (`useMemo(() => buildFramedScene(graph, paint), [graph, paint])`). Verify typecheck + lint; this glue is proven by the visual tier (Task 4).

- [ ] **BLUE**: reviewer then refactor/marker.

---

## Task 4 (Cycle 4): Painted visual baseline (test infrastructure)

**Files:** `bridge/react/scene-harness-view.tsx`, `app/app.tsx`, `e2e/tests/scene-visual-regression.spec.ts`, snapshot.

- [ ] Give `SceneHarnessView` an optional `paint?: Record<string, SurfaceTreatment>` prop (default `{}`), passed into `buildFramedScene(SHELL_FIXTURE, paint)`. In `app.tsx`, when `?fixture=scene-harness&paint=demo` is present, pass a fixed demo paint store (a painted floor and one wall face, built from `solidTreatment(colorFromHex(...), ...)` keyed by `surfaceKey`). Add a `renders the painted wall shell` test to `scene-visual-regression.spec.ts` at `/?fixture=scene-harness&paint=demo`, snapshot `scene-shell-painted-webgl.png`. Rebuild, kill 4173, `--update-snapshots=all`, review by eye (the floor reads the painted color), commit `test(e2e): add a painted wall-shell baseline`.

---

## 7a gate and rollout

- [ ] Full gate, `rgb:audit -- --range main..HEAD` clean, rebuild + chromium + scene-webgl e2e green. Push, PR (humanized), CI, merge (real times). Roadmap flip deferred until 7b (row stays in progress).

---

## Task 5+ (7b): Wall-face paint (separate PR, separate plan section)

The wall builders tag each wall's two long faces with `{ kind: 'wall-face', wallId, side }`. The wall builder (`engine/scene/wall-builder.ts`) has two paths: the box wall (`FACE_ROLES.map`) and the opening-wall profile (`sections.map`). For each, the interior and exterior long faces map to the paint model's `side: 'left' | 'right'` by a fixed convention relative to the wall direction (start to end). DECISION (per the user, "ship both, flag for review"): pick a convention, ship it, and FLAG in the 7b PR body that the interior/exterior to left/right mapping needs visual confirmation against the 2D Paint panel, noting the one-line swap site. Cycles: (5) a helper `wallFaceRef(wallId, role)` / per-section ref and the box-wall tagging with a Node test (paint a wall-face ref, assert the long-face mesh is the paint color); (6) the opening-wall profile tagging; (7) refresh the painted baseline to include a painted wall face. Then gate, PR, merge, and the roadmap flip to merged (ADR-0067 / 7a PR, 7b PR).

## Self-review against the spec

- Seam widens to `material(role, ref?)`, neutral ignores ref, paint resolves (spec 2): Task 1. Covered.
- Albedo is the paint color; light carries temperature (spec 2): Task 1 (color from hex; lights unchanged). Covered.
- Builders tag floor/ceiling (7a) and wall faces (7b) with refs (spec 3): Tasks 2, 5. Covered.
- Paint threaded as the project store, read reactively (spec 4): Task 3. Covered.
- Painted baseline (spec 5): Tasks 4, 7. Covered.
