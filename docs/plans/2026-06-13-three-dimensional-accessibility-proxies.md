# Three-Dimensional Accessibility Proxies (6b) Implementation Plan

> **For agentic workers:** Executed from the main thread with the role-separated red-green-blue subagents. Each cycle is test -> feat -> refactor; the main thread commits. Part 6b of the selection-and-accessibility slice (spec `docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md`, ADR-0066). Part 6a (pointer selection and outline) is merged.

**Goal:** Give the opaque three-dimensional canvas a keyboard and screen-reader surface: a focusable, labeled proxy per selectable entity, positioned at its projected screen location, with a roving tab order, and a live region announcing the selection.

**Architecture:** Layering is fixed: `editor` imports `bridge` one way, so the three-dimensional overlay lives in `bridge/` with the canvas and does not reuse `editor/plan`'s overlay code. A pure engine function projects entity anchors to screen pixels (Node-tested). A pure-DOM bridge overlay renders the proxy `listbox` with a small roving-tabindex hook and an `aria-live` region (jsdom-tested). A glue projector inside the canvas feeds live projected positions to the overlay rendered beside the canvas. Selection is the shared bridge store (6a), so activating a proxy selects through it and the plan reflects it. See ADR-0066.

**Tech Stack:** TypeScript, Three.js (engine only), React Three Fiber (bridge glue), Vitest (Node + jsdom), Playwright (`scene-webgl`).

---

## Conventions

RED `test:` (test-author), GREEN `feat:` (implementer), BLUE `refactor:` (clean-code-reviewer then refactorer; empty marker if none). Subagents get exact allowed files; main thread owns barrels. Plain commits, no em-dash, Conventional Commits. Full `pnpm test` after each GREEN.

## File structure

Created: `engine/scene/entity-screen-positions.ts` (+ test); `bridge/react/scene-proxy-overlay.tsx` (+ test); `bridge/react/use-proxy-roving-focus.ts` (minimal roving-tabindex hook, + test if practical); `bridge/react/scene-proxies.tsx` (glue projector + overlay mount); `e2e/tests/scene-accessibility.spec.ts`.
Modified: `engine/index.ts` (barrel); `bridge/react/webgpu-scene-view.tsx` (mount the projector/overlay); ROADMAP.md (after merge).

---

## Task 0: Docs

- [ ] Commit this plan (spec + ADR-0066 already on main from 6a): `git add docs/plans/2026-06-13-three-dimensional-accessibility-proxies.md && git commit -m "docs: 6b plan for three-dimensional accessibility proxies"`. (Roadmap slice 7 row is already "in progress" from 6a.)

---

## Task 1 (Cycle 1): Project entity anchors to screen (engine)

**Files:** create `engine/scene/entity-screen-positions.ts` (+ test); modify `engine/index.ts`.

- [ ] **RED** (`test-author`; file `engine/scene/entity-screen-positions.test.ts`): the module exports
      `entityScreenPositions(root: THREE.Object3D, camera: THREE.Camera, width: number, height: number): { id: string; x: number; y: number }[]`.
      For each distinct `userData.entityId` in the tree, compute the merged world bounding-box centre, project it with `vector.project(camera)` to normalized device coordinates, convert to pixels (`x = (ndc.x + 1) / 2 * width`, `y = (1 - ndc.y) / 2 * height`), and include it only when it is in front of the camera (`ndc.z < 1`) and within `[0, width] x [0, height]`. Build a scene with `buildScene` from a one-wall graph (`wall:w1`, (0,0)->(2000,0), thickness 120, height 2400); aim a `PerspectiveCamera` at the wall centre `(1000, 1200, 0)` from `(1000, 1200, 4000)`; assert the result contains an entry with `id === 'wall:w1'` whose `x` is near `width/2` and `y` near `height/2` (within, say, width/4). Use `width = height = 320`. Also: a camera pointed away yields no entry for the wall. Confirm FAIL (module missing). Commit `test: project entity anchors to screen positions`.

- [ ] **GREEN** (`implementer`; files `engine/scene/entity-screen-positions.ts`, `engine/index.ts`): reuse `entityIdOf` from `./entity-id`. Collect distinct entity ids with a `THREE.Box3` accumulated over each mesh whose `entityIdOf` matches (expand by the mesh world bounds). For each, take `box.getCenter`, `.project(camera)`, guard `ndc.z < 1` and in-bounds, push `{ id, x, y }`. Barrel-export. Run test + typecheck. Commit `feat: project entity anchors to screen positions`.

- [ ] **BLUE**: reviewer then refactor/marker.

---

## Task 2 (Cycle 2): The proxy overlay (bridge, jsdom)

**Files:** create `bridge/react/use-proxy-roving-focus.ts`, `bridge/react/scene-proxy-overlay.tsx`, `bridge/react/scene-proxy-overlay.test.tsx`.

- [ ] **RED** (`test-author`; file `bridge/react/scene-proxy-overlay.test.tsx`): `SceneProxyOverlay` props:
      `{ proxies: { id: string; label: string; x: number; y: number }[]; selectedIds: ReadonlySet<string>; onSelect: (id: string, additive: boolean) => void }`.
      It renders a `role="listbox"` (aria-label "3D entities", aria-multiselectable) of `role="option"` elements, each with its label as accessible name, `aria-selected` reflecting `selectedIds`, positioned absolutely at `(x, y)`, with a roving tabindex (exactly one option has tabIndex 0). A polite `role="status"` region announces the selection count/labels. Pressing Enter or Space on a focused option calls `onSelect(id, false)`; a modifier-Enter calls `onSelect(id, true)`. Empty `proxies` renders no listbox. Tests (jsdom, testing-library), mirroring `scene-nav-toolbar.test.tsx`:
  - renders an option per proxy with its label and aria-selected
  - exactly one option is in the tab order (tabIndex 0), the rest -1
  - Enter on a focused option selects it (onSelect called with id, false)
  - the live region names the current selection
    Confirm FAIL. Commit `test: the 3D entity proxy overlay exposes a roving-tabindex listbox`.

- [ ] **GREEN** (`implementer`): `use-proxy-roving-focus.ts` holds the focus index + arrow/Home/End handling + container ref (a minimal copy of the roving pattern, since bridge cannot import editor). `scene-proxy-overlay.tsx` renders the listbox/options absolutely-positioned, pointer-events none on the container and auto on options, the live region built from `selectedIds` and the proxy labels. Keep functions under 40 lines (extract an `EntityProxyOption` subcomponent and a `selectionAnnouncement(proxies, selectedIds)` helper). Run tests + typecheck + lint. Commit `feat: render the 3D entity proxy overlay`.

- [ ] **BLUE**: reviewer then refactor/marker. (Watch max-lines-per-function and no-magic-numbers.)

---

## Task 3 (Cycle 3): Glue the projector and mount the overlay (e2e-proven)

**Files:** create `bridge/react/scene-proxies.tsx`, `e2e/tests/scene-accessibility.spec.ts`; modify `bridge/react/webgpu-scene-view.tsx`.

- [ ] **RED**: `e2e/tests/scene-accessibility.spec.ts` (commit `test:`). In the full-width 3D view of a drawn room, focus the first proxy option (via `getByRole('option')` then `.focus()` or keyboard Tab), press Enter, and assert the settled frame changed (the outline appeared) and the option has `aria-selected="true"`. Reuse `drawnRoomCanvas` and `stableFrame`. Commit `test: keyboard selection through the 3D proxy overlay`.

- [ ] **GREEN**: `scene-proxies.tsx` mounts inside the Canvas, uses `useThree` (camera, gl size) and `useFrame` to compute `entityScreenPositions(root, camera, width, height)` and write them (with labels from the scene graph node kinds, e.g. "Wall 1", "Room 1", "Opening 1") to lifted state in `WebGPUSceneView`; the overlay `<SceneProxyOverlay>` renders as a sibling of the `<Canvas>` (a positioned DOM layer over it). Throttle the per-frame state write (only update when a position moved by > ~1px, or at most ~20/s) to avoid render storms. Wire `onSelect` to the shared selection (`select`/`toggle`). Labels are generated in bridge from `useSceneGraph()` (kind + per-kind index); do not import editor. Verify: typecheck, lint, full test, build, kill 4173, `playwright --project=scene-webgl scene-accessibility`. Commit `feat: keyboard and screen-reader proxies over the 3D canvas`.

- [ ] **BLUE**: reviewer then refactor/marker. Confirm `WebGPUSceneView` functions stay under 40 lines (extract the proxy state/labels into a hook `useSceneProxies`).

---

## Gate and rollout (6b)

- [ ] Full gate (`typecheck && lint && format:check && test && integration:audit && build`), `rgb:audit -- --range main..HEAD` clean, rebuild + kill 4173 + chromium and scene-webgl e2e green.
- [ ] Push, PR (humanized), wait CI, merge (real times).
- [ ] Flip ROADMAP slice 7 row to merged (ADR-0066 / #99 + 6b PR) and note in the track summary; separate docs PR. Update the resume memory and the autonomous notes.

## Self-review against the spec

- Focusable, labeled proxy per entity, roving tab order (spec 5): Cycles 2, 3. Covered.
- Positioned at projected screen location (spec 5): Cycles 1, 3. Covered.
- Live-region announcement driven by shared selection (spec 5): Cycle 2. Covered.
- Activating a proxy selects through the shared store, same modifier rules as pointer (spec 5): Cycles 2, 3. Covered.
- Proxy layer takes no pointer events; pick stays on the canvas (spec 5): Cycle 2 (pointer-events none on container). Covered.
