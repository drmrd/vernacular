# Daylight-through-glass implementation plan

> **For agentic workers:** This project runs its own red-green-blue TDD cycle through
> role-separated subagents dispatched from the MAIN thread: `/test-first` (test-author, commits
> `test:`), `/implement` (implementer, commits `feat:`), `/clean-code-review`, `/refactor`
> (commits `refactor:`, possibly an empty marker). Do NOT use the generic subagent-driven harness.
> One behavior equals one full test -> feat -> refactor cycle; close every GREEN with a BLUE
> BEFORE the next `test:` commit, and run `node scripts/rgb-audit/rgb-audit.mjs --range
origin/main..HEAD` before every push. Feat-only commits need an `Infrastructure:` trailer.
> `test(e2e):` scene-tier commits are cycle-exempt. Source current-state facts from MERGED main:
> read `core/scene/opening-fill.ts`, `engine/scene/opening-fill-builder.ts`,
> `engine/scene/shadow-casters.ts`, `engine/materials/role-appearance.ts`,
> `engine/lighting/lighting-rig.ts`, `app/harness-environment.ts`,
> `bridge/react/scene-harness-view.tsx`, `e2e/tests/scene-solar.spec.ts`, issue #444, the slice
> spec `docs/specs/2026-07-05-daylight-through-glass.md`, and ADR-0148/0149/0151/0152.

**Goal:** Sunlight streams through a window: the sash and muntin frames cast their shadow onto the
floor while the glass pane does not, so a room in direct sun reads as lit rather than sealed. The
glass role is shaped so the epic's later stained-glass light cookie has a named attachment point.
Closes issue #444.

**Architecture:** The opening-fill builder stamps each part mesh with its `OpeningFillRole`
(`leaf` or `glass`) in `userData`. `markShadowCasters` becomes role-aware through one exported
predicate, `isGlassPane(object)`, which reads that stamp: glass gets `castShadow = false`, every
other mesh keeps `castShadow = true`, and every mesh keeps `receiveShadow = true`. The rule lives on
the mesh, not the material, so slice 3's material swap (#449) cannot break it, and the same
predicate is the seam the stained-glass cookie will attach to (epic layer 4). A new canonical
harness state, `window-light`, frames the shell's east window from inside the room under a morning
eastern sun so the muntin shadow reads at capture size.

**Tech stack:** TypeScript, Three.js r184, React Three Fiber 9, Vitest, Playwright scene-webgl tier
(dev-Mac `-darwin` baselines and runner `-linux` baselines, per ADR-0149 and ADR-0152).

## Global constraints

- core/ imports no React/Three.js; engine/ is the only Three.js importer; the bridge is the only
  layer that touches both React and the engine; app wires the harness state. The role stamp is a
  string enum already in core (`OpeningFillRole`); the mesh stamp and the predicate are engine.
- All model mutations flow through `dispatch(command)`; nothing here touches the model or undo. The
  shadow flags and the harness state are view/render state only. No schema bump, no migration.
- ESLint zero-problems gate (warnings count): max-lines-per-function 40, max-lines 300, max-params
  3, complexity 10, no-magic-numbers (name a `const`). Test files relax no-magic-numbers and get
  120-line functions.
- Vitest filter: `pnpm exec vitest run <path>` (never `pnpm test -- <x>`). Full gate:
  `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, checking each
  command's own exit code (no piped tail).
- Conventional Commits; NO Co-Authored-By, NO session trailers, NO em-dash in new text. Author
  `Dan Moore <9156191+drmrd@users.noreply.github.com>`. Window commit dates off employer hours
  (08:30 to 18:30 local) before the first push.
- Branch `docs/daylight-through-glass-spec` carries the spec and this plan; the code lands on a
  `feat/daylight-through-glass` branch off main. Do NOT put `scene-` in the code worktree's
  directory name: an absolute path containing `scene-` routes every spec into the `scene-webgl`
  Playwright project (ADR-0149's trap).
- This slice adds NO dependencies.
- Scene baselines render on two families only: `-darwin` on the development Mac's Metal tier and
  `-linux` on the ubuntu runner through the dispatch workflow. Never hand-edit a baseline PNG.

## Locked decisions (owner-approved)

1. **The shadow rule keys on a build-time role stamp, not the material.** Material-name matching is
   rejected because slice 3 (#449) replaces the glass material. Shadow-camera layers are rejected
   because layers are a scarce global resource (32 total, already partly claimed).
2. **Glass keeps `receiveShadow = true`.** A frame's shadow across a pane is physically right, so
   there is no special case on the receive side.
3. **`isGlassPane` is the stained-glass cookie seam.** The predicate that gates shadow casting is
   the same one epic layer 4 will use to collect panes. This slice adds no cookie code; ADR-0153
   records the contract.
4. **The proof is the new `window-light` state plus a full scene-tier regeneration.** The
   window-light state uses a morning eastern sun (not equinox noon) because the shell's only window
   faces east; see Task 4 for why the code argues against reusing the shared instant. The schematic
   shell family is the group that visibly shifts and the solar states hold (Task 6).
5. **Both baseline families refresh.** Every baseline that shifts is regenerated `-darwin` locally
   and `-linux` through `refresh-scene-baselines.yml`; see Task 6.
6. **The window-light camera pose attaches to the environment state.** `HarnessEnvironmentState`
   gains an optional `cameraPose`, `app.tsx` forwards it with the rest of the environment, and
   `SceneHarnessView` prefers an environment pose over a geometry override before the auto-frame
   (Tasks 4 and 5). The duplicate-geometry-key alternative is rejected; the spec records why.
7. **The `window-light` state is this slice's sole in-tree demonstration.** The south-facing shell
   window that would let the shared solar instants also show daylight through glass is deferred and
   tracked in a follow-up issue the orchestrator files at slice end (see Deferred work).

## File structure

Modified (engine):

- `engine/scene/opening-fill-builder.ts` : stamp each part mesh with its `OpeningFillRole`.
- `engine/scene/opening-fill-builder.test.ts` : the stamp test.
- `engine/scene/shadow-casters.ts` : export `isGlassPane`; make `markShadowCasters` role-aware.
- `engine/scene/shadow-casters.test.ts` : the predicate and role-aware-flagger tests.
- `engine/index.ts` : export `isGlassPane` (the cookie seam a later slice consumes).

Modified (app + bridge):

- `app/harness-environment.ts` : add the `window-light` state; extend `HarnessEnvironmentState` with
  an optional camera pose.
- `app/harness-environment.test.ts` : the window-light resolution test.
- `bridge/react/scene-harness-view.tsx` : prefer an environment-supplied camera pose over the
  geometry override; extend the bridge `HarnessEnvironment` with the optional pose.
- `bridge/react/scene-harness-view.test.ts` (or the existing bridge test that covers the harness
  camera resolution) : the pose-precedence test.

Modified (acceptance):

- `e2e/tests/scene-solar.spec.ts` : the `window-light` capture case.
- Scene baseline PNGs under `e2e/tests/scene-*.spec.ts-snapshots/`, both families (Task 6).

New:

- `docs/knowledge/decisions/ADR-0153-daylight-through-glass-role-stamp.md` (0152 is the highest on
  main at the time of writing; re-verify before landing).

---

## Task 1: Stamp the opening-fill role onto each built part mesh (engine)

**Files:** `engine/scene/opening-fill-builder.ts` and its test.

**Design:** `buildPartMesh` already receives the `OpeningFillPart`, so it holds `part.role`. Write
that role onto the mesh under one shared `userData` key (name a `const` for the key so the stamp and
the predicate in Task 2 agree on it). Stamp every part, both `leaf` and `glass`, so the marker is
uniform and the predicate never has to distinguish absent from `leaf`.

**Steps:**

- [ ] **Step 1: RED.** In `opening-fill-builder.test.ts`, build a double-hung window node through
      `buildOpeningFill` and assert the pane mesh carries the `glass` role in `userData` under the
      shared key and a frame mesh carries `leaf`. Commit
      `test: stamp the opening-fill role onto each built part mesh`.
- [ ] **Step 2: GREEN.** Stamp `part.role` in `buildPartMesh`. Full gate. Commit
      `feat: stamp the opening-fill role onto each built part mesh`.
- [ ] **Step 3: BLUE.** `/clean-code-review` then `/refactor` (or empty marker).

---

## Task 2: The isGlassPane predicate (engine)

**Files:** `engine/scene/shadow-casters.ts` and its test; `engine/index.ts`.

**Interfaces:**

```ts
/** True for exactly a mesh the opening-fill builder stamped with the glass role. */
export function isGlassPane(object: THREE.Object3D): boolean
```

**Design:** Read the same `userData` key Task 1 writes and compare it to the `glass` role. A non-mesh
object, a mesh with no stamp, and a `leaf`-stamped mesh all return false. Export it from
`engine/index.ts` so the later cookie slice can import the seam.

**Steps:**

- [ ] **Step 1: RED.** In `shadow-casters.test.ts`, assert `isGlassPane` returns true for a
      glass-stamped mesh and false for a `leaf`-stamped mesh, an unstamped mesh, and a non-mesh
      `Object3D`. Commit `test: identify a glass pane by its opening-fill role stamp`.
- [ ] **Step 2: GREEN.** Implement `isGlassPane`; export it from `engine/index.ts`. Full gate.
      Commit `feat: add the isGlassPane opening-fill predicate`.
- [ ] **Step 3: BLUE.**

---

## Task 3: Role-aware markShadowCasters (engine)

**Files:** `engine/scene/shadow-casters.ts` and its test.

**Design:** Keep the whole-tree walk. For each mesh set `receiveShadow = true` as today and set
`castShadow = !isGlassPane(object)`. The existing "flags every mesh as caster and receiver" test
narrows to "every non-glass mesh," so update that test's intent alongside the new glass case in the
same RED commit.

**Steps:**

- [ ] **Step 1: RED.** In `shadow-casters.test.ts`, assert a glass-stamped mesh gets
      `castShadow === false` and `receiveShadow === true`, and a `leaf`-stamped mesh and an
      unstamped mesh get `castShadow === true` and `receiveShadow === true`. Commit
      `test: keep glass panes from casting shadows`.
- [ ] **Step 2: GREEN.** Make `markShadowCasters` role-aware through `isGlassPane`. Full gate.
      Commit `feat: stop glass panes from casting shadows`.
- [ ] **Step 3: BLUE.**

---

## Task 4: The canonical window-light harness state (app)

**Files:** `app/harness-environment.ts` and its test.

**Why not the shared instant:** The shell fixture's only window sits in the east wall. The
equinox-noon instant the other solar states share puts the sun almost due south (azimuth about 177
degrees; `core/environment/solar-position.test.ts`), which grazes an east wall and casts no window
shadow on the floor. The committed `equinox-noon` baseline shows no floor pattern. The window-light
state uses instead the summer-solstice morning instant the same reference case pins, which puts the
sun due east:

```ts
const WINDOW_LIGHT_OBSERVATION: ObservationInstant = {
  date: '2026-06-21',
  minutesSinceMidnight: 540, // 09:00 Eastern; sun due east (azimuth ~89 deg, altitude ~37 deg)
}
```

The canonical site's timezone resolves the same offset on that date the reference case uses, so the
harness sun matches the reference sun.

**Design:**

- Add a `window-light` entry to `HARNESS_ENVIRONMENT_STATES`: the canonical site, the instant above,
  `realistic: true`, `scene: 'shell'` (the clear-floor shell, no furniture between window and
  floor), and an interior camera pose. Extend `HarnessEnvironmentState` with an optional
  `cameraPose?: CameraPose` (imported from core).
- The camera pose stands inside the room, west of and below the window head, aimed east and slightly
  down, so the window with the sun beyond it and the floor just inside the sill are both in frame at
  320 by 240. Name the pose constant; tune the exact eye and target in Task 6 against the capture.
- Keep the `?scene=` keyspace disjoint: `window-light` is an environment-state key, distinct from
  the geometry keys (`junctions`, `furniture`, `adjacent-rooms`) and the `shell` default it pairs.

**Steps:**

- [ ] **Step 1: RED.** In `app/harness-environment.test.ts`, assert `window-light` resolves to the
      canonical site, the `2026-06-21` / 540-minute instant, `realistic: true`, the `shell` fixture,
      and a camera pose (assert the pose is present and its target sits inside the room footprint).
      Commit `test: resolve the canonical window-light harness state`.
- [ ] **Step 2: GREEN.** Add the state and the optional pose field. Full gate. Commit
      `feat: add the canonical window-light harness state`.
- [ ] **Step 3: BLUE.**

---

## Task 5: The harness honors an environment camera pose (bridge)

**Files:** `bridge/react/scene-harness-view.tsx` and its test.

**Design:** Today `SceneHarnessView` picks its camera from `harnessCameraOverride(scene)` (a
per-geometry override, used by `adjacent-rooms`) and otherwise auto-frames. The window-light pose
belongs to the environment state, not the geometry (locked decision 6), because the plain `shell`
geometry must keep its standing frame for the schematic `scene-shell` baseline. Extend the bridge
`HarnessEnvironment` with
the optional `cameraPose?: CameraPose` and resolve the camera in one place with a clear precedence:
an environment pose wins, then a geometry override, then the auto-frame. Extract the precedence into
a pure function so it unit-tests without a renderer.

**Steps:**

- [ ] **Step 1: RED.** In the bridge harness test, assert the pure resolver returns the
      environment's `cameraPose` when present, the geometry override when only that is present
      (`adjacent-rooms`), and undefined (auto-frame) otherwise. Commit
      `test: prefer an environment camera pose over the geometry override`.
- [ ] **Step 2: GREEN.** Add the resolver and route both the `Canvas` camera prop and `StaticFrame`
      through it; carry the optional pose on `HarnessEnvironment`. `app/app.tsx` already forwards the
      whole environment object, so the pose flows once both the app and bridge environment types
      carry the field; verify the forward. Full gate. Commit
      `feat: frame a harness state through its environment camera pose`.
- [ ] **Step 3: BLUE.** Confirm by reading that a `shell`-geometry render with no environment pose
      still auto-frames, so the schematic `scene-shell` framing is unchanged.

---

## Task 6: Acceptance and baselines (`test(e2e):`, cycle-exempt; both families)

**Files:** `e2e/tests/scene-solar.spec.ts`; scene baseline PNGs.

**Steps:**

- [ ] Add one `captureShell` case for `&scene=window-light` writing `scene-window-light-webgl.png`,
      reusing the existing `SHELL_THRESHOLD` and `SHELL_MAX_DIFF_PIXEL_RATIO`. Commit
      `test(e2e): pin the window-light interior baseline`.
- [ ] Before refreshing anything, run the whole scene tier without an update to see exactly which
      baselines the change moves:

      ```
      pnpm exec playwright test e2e/tests/scene-visual-regression.spec.ts \
        e2e/tests/scene-solar.spec.ts --project=scene-webgl
      ```

      Expect the schematic `scene-shell`, `scene-shell-warm`, `scene-shell-painted`, and
      `scene-furniture` baselines to diff (the frame pattern replaces the glass shadow), and expect
      `scene-junctions`, `scene-adjacent-rooms`, and the solar states to hold or diff only by a thin
      sliver. If a no-glazing state (`scene-junctions`, `scene-adjacent-rooms`) moves, stop and
      investigate: nothing there should change.

- [ ] Regenerate the `-darwin` family on the development Mac and tune the window-light pose until the
      muntin shadow is the clear subject:

      ```
      pnpm exec playwright test e2e/tests/scene-visual-regression.spec.ts \
        e2e/tests/scene-solar.spec.ts --project=scene-webgl --update-snapshots=all
      ```

      Review every regenerated PNG by eye. Commit
      `test(e2e): refresh the darwin scene baselines for daylight through glass`.

- [ ] Seed the `-linux` family through the dispatch workflow so the ci.yml `scene-visual` job passes.
      The workflow renders whatever ref it is dispatched against, so dispatch it on the pushed
      `feat/daylight-through-glass` branch (not main), download the artifact, and commit the
      `-linux` PNGs to the branch. This session does not write to GitHub, so hand the owner:

      ```
      gh workflow run refresh-scene-baselines.yml --ref feat/daylight-through-glass
      gh run watch <run-id>
      gh run download <run-id> --name scene-baselines --dir <repo-root>
      ```

      The artifact carries `*-scene-webgl-linux.png` under both snapshot dirs, including the new
      `scene-window-light-webgl-scene-webgl-linux.png`. Commit
      `test(e2e): refresh the linux scene baselines for daylight through glass`, then confirm the
      `scene-visual` CI job is green on the PR.

- [ ] Manual sanity check on the dev Mac live view: open a plan with a sunlit window in realistic
      mode and confirm the frame shadow falls on the floor with light through the panes. The live
      WebGPU path has no committed pixel coverage (issue #469); this is the same manual posture
      ADR-0151 took.

---

## Task 7: Knowledge, ADR-0153

- [ ] **Step 1:** Re-verify 0153 is the next free number across origin/main and any open branches
      (0152 is the highest on main at the time of writing).
- [ ] **Step 2:** Write `ADR-0153-daylight-through-glass-role-stamp.md`: the build-time role stamp on
      opening-fill meshes and why it beats material-name matching (slice 3 replaces the material) and
      shadow-camera layers (a scarce global resource); `isGlassPane` as both the shadow-caster gate
      and the stained-glass cookie attachment point (epic layer 4); glass keeps receiving shadows;
      the rule is lighting-mode independent, so the schematic shell family moves while the solar
      states hold, the inverse of the ambient-occlusion slice (ADR-0151). Humanizer pass (ADRs are
      human-read); no em-dashes. Commit `docs: record ADR-0153 for daylight through glass`.
- [ ] **Step 3:** Update the epic checklist and close #444 through the PR (`Closes #444`). The
      deferred-work issue below is filed by the orchestrator at slice end; reference it from the PR
      description once it exists.

## Deferred work

- **Default solar states do not exhibit daylight through glass.** The shell fixture's only window
  faces east while every shared solar instant places the sun to the south or southwest, so the
  default solar baselines never show sun through the shell's window; only the new `window-light`
  state does, and the owner accepted it as this slice's sole in-tree demonstration (locked decision
  7). The follow-up gives the shell fixture a south-facing window (or adds a south-window realistic
  state) so the equinox-noon family also demonstrates the epic's headline. It is a
  fixture-and-baseline change, not part of the shadow rule, and is tracked in a follow-up issue the
  orchestrator files at slice end.

## Baseline-refresh reference

- Two baseline families: `-darwin` renders on the development Mac's Metal tier and is the
  authoritative local render (ADR-0149); `-linux` renders on the ubuntu runner's SwiftShader through
  `refresh-scene-baselines.yml` and is the family CI's `scene-visual` job checks (ADR-0152). A change
  that moves a harness fixture regenerates both.
- Local refresh:

  ```
  pnpm exec playwright test e2e/tests/<spec> --project=scene-webgl --update-snapshots=all
  ```

  New baselines land as `-scene-webgl-darwin.png`.

- Linux refresh: dispatch `refresh-scene-baselines.yml` against the branch under test, download the
  `scene-baselines` artifact, commit the `-scene-webgl-linux.png` PNGs. The `scene-visual` CI job
  runs only when the tree already carries `-linux` baselines (it does, since ADR-0152 seeded them),
  so an out-of-date `-linux` family fails the PR until this step lands.
- A missing baseline self-skips its case until `--update-snapshots=all` creates it, so the new
  `window-light` case is inert until Task 6 seeds it.
- Do not put `scene-` in the code worktree's directory name (ADR-0149's Playwright routing trap).

## Out of scope

- No stained-glass light cookie; this slice only fixes `isGlassPane` as its attachment point (epic
  layer 4).
- No transmissive colored-glass material; slice 3 (#449) swaps the material, which is why the shadow
  rule keys on the mesh stamp and not the material.
- No artificial light; a later epic wave.
- No change to the door leaf, which is opaque and keeps casting.
- No south-facing shell window or default-solar daylight demonstration; deferred and tracked in a
  follow-up issue (see Deferred work, locked decision 7).

## Self-review

- Issue #444 scope bullets: make `markShadowCasters` role-aware so glass stops casting while frames
  keep casting, and the muntin pattern falls on the floor (Tasks 1 to 3); shape the glass role so a
  future stained-glass cookie can attach (the `isGlassPane` seam, Task 2, ADR-0153); a story shows
  daylight through a window with the frame pattern on the floor (the `window-light` state, Tasks 4
  to 6).
- Type flow: `OpeningFillRole` is stamped in Task 1, read by `isGlassPane` in Task 2, and consumed
  by `markShadowCasters` in Task 3. `CameraPose` is added to the harness state in Task 4 and honored
  by the harness in Task 5.
- Layering: the role enum is core; the mesh stamp and predicate are engine; the harness state is
  app; the camera-pose precedence is bridge. core imports no Three.js. No model change, so no schema
  bump and no migration.
- Mode independence is stated and its consequence is scoped honestly: the schematic shell family
  moves and the solar states hold, verified by running the whole scene tier without an update before
  any refresh (Task 6), the inverse of the ambient-occlusion slice.
- The camera seam is locked, not open: the environment-state pose (locked decision 6) gets its
  resolution cycle in Task 4, mirroring the ambient-occlusion state's resolution-test idiom, and its
  harness precedence cycle in Task 5.
