# Public-Beta Dependency DAG and Parallel-Wave Work Plan

> **For agentic workers:** This is an orchestration plan across the 26 open `public-beta`
> issues, not a single-feature task plan. Each issue is delivered through its own
> red-green-blue TDD cycle (test-author -> implementer -> clean-code-reviewer -> refactorer)
> in its own sibling worktree. The waves below say _what may run concurrently_; the lanes say
> _what must run in sequence to avoid file collisions_. Use the project subagent roster and
> `.claude/rules.md` (rgb:audit rule 14) for each issue. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sequence the 26 public-beta issues into a dependency-respecting, collision-free set
of parallel waves and begin executing wave 1.

**Approach:** Most alpha-era prerequisites already shipped, so the within-beta dependency graph
is shallow (longest chain = 3). The real constraint on parallelism is not logic dependencies but
_shared hot files_ in the 3D-camera and editor-plan code. We therefore model the work as **lanes**
(file territories that must stay sequential) crossed with **waves** (one active issue per lane runs
concurrently in its own worktree). The main thread owns Storybook baseline refresh and sequential
merges, exactly as in the alpha follow-up run.

**Tech stack:** TypeScript, React, R3F/Three.js, Vitest, Playwright (e2e + Storybook visual),
pnpm. Layered architecture: `core/` (pure domain) / `engine/` (Three.js) / `bridge/` (R3F glue) /
`editor/` / `storage/` / `app/`.

## Global constraints (apply to every issue)

- Conventional Commits; no `Co-Authored-By` / `Claude-Session` (or any AI-session) trailer.
- No em-dashes in newly composed prose; humanizer pass for human-read docs only (specs/ADRs/READMEs),
  not this plan.
- 30-day dependency cooldown; exact version pins; committed lockfile. No new dep younger than 30 days.
- `core/` imports neither React nor Three.js; `engine/` is the only Three.js importer; all mutations
  flow through `dispatch(command)`; asset references are content-addressed.
- Branch names descriptive (`feat/<short>`, `fix/<short>`); no milestone codes; no third-party product
  names anywhere persisted.
- Every issue runs the full RGB cycle and closes each GREEN with a (possibly empty) refactor commit
  before the next test. `rgb:audit` range is `origin/main..HEAD`.
- Never push to `main`; PRs require the `ci-complete` gate; merge with `gh pr merge --merge`.
- **GitHub write authorization for this beta run is not yet granted.** Do not push, open PRs, merge,
  or edit issues/board until the owner confirms. Hand over `gh` commands when blocked.

---

## What alpha already shipped (this reshapes the scope)

The exploration below corrected several dependency guesses from the prior handoff. Verdicts carry
file:line evidence; **bold** items materially shrink an issue or dissolve a dependency.

| Area                         | Finding                                                                                                                                                                                                         | Evidence                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor model                  | **Floors already carry `elevation: number`** (negative = below grade is representable). Missing: `renameFloor` / `setFloorElevation` / `reorderFloor` commands, default naming, basement UX.                    | `core/model/types.ts:162`; `engine/scene/build-scene.ts:41`; plan `2026-06-10-structure-and-multi-floor.md:17`                              |
| Multi-floor 3D               | **`buildScene()` already stacks every floor at `position.y = elevation`.** A unified all-floors render exists at the engine level; #206 is mostly a view/UI + basement-toggle slice.                            | `engine/scene/build-scene.ts:18-66`; `core/scene/scene-graph.ts:31-36`; ADR-0018                                                            |
| Stairs                       | **Stair entity, commands, 2D plan symbol, and floor-spanning topology already exist.** Missing: the editor stair _tool_ (not exposed), non-straight tread 2D refinement, and all 3D geometry.                   | `core/model/types.ts:241-255`; `core/commands/handlers/stair-commands.ts`; `editor/plan/draw-stair.ts:103`; `core/topology/stair-well.ts:7` |
| Walls                        | Straight segments only; no arc/curve field anywhere. #80 is genuinely net-new.                                                                                                                                  | `core/model/types.ts:68-76`                                                                                                                 |
| Ceilings                     | Per-floor `defaultCeilingHeight` and per-room `RoomOverride.ceilingHeight?` exist (model). Sloped/roof geometry missing; height accessor seam reserved.                                                         | `core/model/types.ts:163,203`; `core/scene/ceiling-height.ts:8`                                                                             |
| Walk camera                  | `advanceWalk` is pure kinematics: **no collision at all.** Floats at `WALK_EYE_HEIGHT_MM=1700`, clips through walls.                                                                                            | `core/scene/walk-camera.ts:49-72,4`                                                                                                         |
| Openings interaction         | **No open/closed state on openings; no E-key / interact system.** Opening-fill geometry (leaf/sash/glass, ADR-0081) exists as static parts to animate.                                                          | `core/model/types.ts:88-104`; `core/scene/opening-fill.ts:47`                                                                               |
| Near-wall transparency       | Exists (ADR-0086/0087): fades exterior walls + hosted openings to `FADED_OPACITY=0.1`. **Runs unconditionally (no walk-mode gate); does not fade furniture; selection is exterior-only (not occlusion-based).** | `engine/scene/near-wall-transparency.ts:6,158`; `bridge/react/webgpu-scene-view.tsx:196`                                                    |
| Edge overlay                 | Added **unconditionally** on every mesh; no toggle (ADR-0078).                                                                                                                                                  | `engine/scene/edge-overlay.ts:17`; `engine/scene/build-scene.ts:28`                                                                         |
| Finishes                     | Finish _sheen_ registry exists (flat..gloss); paint is solid-color + finishId. **No exterior wall types (brick/stucco/siding), no per-surface material/texture, no 3D surface render.**                         | `core/registries/finishes.ts:4`; `core/model/paint.ts:10`                                                                                   |
| Room floor styling           | **2D done and persisted** (`SurfaceRef` + `assignSurfacePaint`, floor fill renders). **3D floor-surface paint is the only missing part** (deferred behind the render seam).                                     | `core/paint/resolve-surface-paint.ts`; ADR-0056; ADR-0045                                                                                   |
| Furniture 3D                 | Massing box (ADR-0094) **and** a real-GLB loader + reconciler swap path **both already exist**; the loader is just not wired to actual asset bytes by default.                                                  | `engine/scene/furniture-builder.ts:82`; `bridge/react/use-furniture-model-cache.ts:14`; `bridge/react/framed-scene-reconciler.ts:240`       |
| Selection                    | **Marquee multi-select + shift additive + group drag-move already exist** for walls + dimensions. #201 is an _extend to openings/rooms/underlay_ slice, not net-new.                                            | `editor/plan/marquee.ts`; `editor/plan/use-selection-move.ts`; ADR-0032                                                                     |
| Underlay                     | Loaded + calibrated; **rotation already renders (the #184 blocker is cleared).** Not yet selectable/movable by direct manipulation.                                                                             | `editor/plan/draw-underlay.ts:34`; `editor/plan/calibration-tool.ts`; ADR-0037                                                              |
| Annotations                  | Linear dimensions + adaptive units exist; **graphic scale-bar already renders; `site.northBearing` property already exists.** Missing: the north-arrow graphic.                                                 | `editor/plan/scale-bar.ts`; `core/model/site.ts`; ADR-0039                                                                                  |
| Library era filter           | **`library-filter.ts` already has `distinctEras()` + `matchesEra()`; period/style/room-purpose registries seeded.** #172 may be near-complete; verify remaining scope (style filter / UI) before opening work.  | `editor/library/library-filter.ts`; `core/registries/{periods,styles}.ts`; ADR-0046/0093                                                    |
| Editor a11y                  | Edit-layer selector + ToolsPanel use `aria-pressed` (need radiogroup, #335). Pointer selection is layer-scoped; the keyboard DOM-overlay proxy is **not** (#336).                                               | `editor/tools/edit-layer-panel.tsx:33`; `editor/plan/edit-layer-scope.ts`; ADR-0120/0043                                                    |
| Export progress              | Promise-style indeterminate toast exists (#267); no determinate percentage.                                                                                                                                     | `app/use-export-actions.ts`; ADR-0068                                                                                                       |
| A11y clearances / PDF import | Neither exists in any form. Both net-new.                                                                                                                                                                       | (no matches)                                                                                                                                |

---

## Dependency DAG (within-beta edges only)

Edges point from prerequisite -> dependent. **Hard** = blocked until prerequisite lands. **Soft** =
buildable independently but cleaner / acceptance-complete only after the prerequisite.

```
#126 floor mgmt ──soft──> #206 unified view ──hard──> #207 ground plane
#126 floor mgmt ──soft──> #207 ground plane (basement above-grade datum)
#126 floor mgmt ──soft──> #168 stair tool (floor-spanning placement UX)
#168 stair tool ──hard──> #169 stair 3D geometry
#170 curved 2D vocab ──hard──> #171 3D vocab renderings
#205 room floor paint ──soft──> #208 finishes epic (floor-finishes slice builds on it)
#253 walk collision ──hard──> #257 unify camera (collision = "Toggle A")
#256 transparency refinements ──hard──> #257 unify camera (transparency = "Toggle B")
#253 walk collision ──soft──> #254 walk interact (open door becomes passable)
#257 unify camera ──soft──> #258 edge-overlay toggle (toggle lives in #257's display group)
```

No-incoming-edge roots (everything else is independent within beta):
`#126 #170 #205 #201 #202 #85 #77 #80 #34 #335 #336 #320 #172 #221 #253 #256 #254 #86 #208`.

Longest chains (critical paths, length 3): `#126->#206->#207`, `#126->#168->#169`,
`{#253,#256}->#257->#258`. Everything else is depth <= 2.

---

## Lanes (sequential file territories)

A lane is a set of files that two issues would both edit, so the issues in a lane must run **one at a
time** even when they have no logical dependency. This is what keeps parallel worktrees from colliding
on merge. Run at most one active issue per lane at a time.

| Lane                         | Hot files                                                                                                                                                                               | Issues, in lane order                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A. Floors & stairs**       | `core/model/types.ts` (floor/stair), `core/commands/handlers/*`, floor switcher, `editor/plan/draw-stair.ts`                                                                            | #126 -> #168 -> #169                                                   |
| **B. Walls geometry**        | `core/model/types.ts` (wall), topology, hit-test, snapping                                                                                                                              | #80                                                                    |
| **C. Old-house vocabulary**  | opening registry / shape params, trim/feature data, `core/scene/opening-fill.ts` (3D)                                                                                                   | #170 -> #171                                                           |
| **D. Unified 3D building**   | `engine/scene/build-scene.ts`, `floor-subgroups.ts`, scene toolbar                                                                                                                      | #206 -> #207                                                           |
| **E. 3D camera/nav/display** | `bridge/react/webgpu-scene-view.tsx`, `walk-camera-controls.tsx`, `orbit-camera-controls.tsx`, `core/scene/walk-camera.ts`, `engine/scene/near-wall-transparency.ts`, `edge-overlay.ts` | #253 -> #254 -> #256 -> #257 -> #258                                   |
| **F. Finishes/materials**    | `core/registries/finishes.ts`, `core/model/paint.ts`, surface render seam                                                                                                               | #205 -> #208                                                           |
| **G. Furniture 3D**          | `engine/scene/furniture-builder.ts`, `framed-scene-reconciler.ts`, `use-furniture-model-cache.ts`                                                                                       | #221 (DONE, PR #280)                                                   |
| **H. Ceilings/roof**         | `core/scene/ceiling-height.ts`, roof-plane layer (new)                                                                                                                                  | #86                                                                    |
| **I. 2D selection/underlay** | `editor/plan/marquee.ts`, `use-plan-selection.ts`, `use-selection-move.ts`, underlay draw/select                                                                                        | #202 -> #201                                                           |
| **J. 2D annotations**        | `editor/plan/scale-bar.ts`, north-arrow (new), `plan-overlay.tsx`                                                                                                                       | #85                                                                    |
| **K. A11y clearances**       | new clearance layer in `core/` + `editor/plan/`                                                                                                                                         | #77                                                                    |
| **L. PDF import**            | new ingestion pipeline                                                                                                                                                                  | #34                                                                    |
| **M. Editor a11y**           | `editor/tools/edit-layer-panel.tsx`, ToolsPanel, DOM-overlay proxy                                                                                                                      | #335, #336 (different files; safe to run as two worktrees or sequence) |
| **N. Export progress**       | `storage/zip/export-project-bundle.ts`, rasterize/pdf, notification toast                                                                                                               | #320                                                                   |
| **O. Asset library**         | `editor/library/library-filter.ts`, library panel                                                                                                                                       | #172                                                                   |

**Note on lane E:** #253, #256, #257, #258 (and #254's E-key wiring) all touch
`bridge/react/webgpu-scene-view.tsx` and the camera controllers. They cannot run as parallel
worktrees against each other; they form one sequential lane owned by one worker across waves.

---

## Waves (what may run concurrently)

A wave fires one ready issue per lane. Within a wave, issues touch disjoint files, so their worktrees
merge cleanly. The owner throttles real concurrency (recommend 3-6 live worktrees) and the main thread
serializes merges + baseline refresh between them.

### Wave 1 (roots: unblockers + quick wins + de-risk)

Prioritized so the three critical-path roots (#126, #170, #253) start early, the near-done items get a
fast scope-check, and the new subsystems (#253 collision) de-risk first.

| Issue                        | Lane | Size | Why wave 1                                  | Remaining scope (post-alpha)                                                                                                                                                                      |
| ---------------------------- | ---- | ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #126 floor mgmt              | A    | M    | Unblocks #206, #207, #168                   | `renameFloor`/`setFloorElevation`/`reorderFloor` commands, default naming (ordinal up, Basement down), basement (negative elevation) UX, inline rename in switcher                                |
| #170 curved 2D vocab         | C    | L    | Unblocks #171                               | Arc/curved opening shapes behind registry shape param; trim + wall/ceiling feature data; construction profiles                                                                                    |
| #253 walk collision          | E    | L    | Unblocks #257; new subsystem, de-risk early | Pure capsule-vs-segment slide in `core/scene/walk-camera.ts` (segments + radius in, corrected pos out); feed geometry from `walk-camera-controls.tsx`; stand on floor                             |
| #205 room floor 3D paint     | F    | M    | Unblocks #208; 2D already done              | Render the persisted floor `SurfaceTreatment` on the 3D floor surface (close the render seam); texture support if simple                                                                          |
| #202 underlay select+move    | I    | S    | #184 blocker cleared; small                 | Click-select underlay (distinct), drag to move -> persist `placement.offset`; stretch: rotate/scale handles                                                                                       |
| #85 north arrow + scale bar  | J    | S\*  | Scale bar + `northBearing` already exist    | Render a north-arrow graphic from `site.northBearing`; group with scale bar overlay                                                                                                               |
| #335 radiogroup              | M    | S    | Tiny, independent                           | Edit-layer selector + ToolsPanel: `radiogroup`/`role=radio`/`aria-checked` + arrow-key roving focus                                                                                               |
| #320 determinate export      | N    | S    | Independent                                 | Thread progress callbacks through `exportProjectBundle` per-asset loop, `rasterizeSvgToPng`, `svgPlanToPdf`; determinate bar when a fraction is supplied                                          |
| #172 library style filtering | O    | S\*  | Era filter done; style filter remains       | Add `styles: string[]` to `LibraryItem` + pack manifest, `distinctStyles()`/`matchesStyle()` in `library-filter.ts`, a `StyleChips` control mirroring `EraChips`, seed starter-pack styles, tests |

`*` = smaller than the issue's `size:` label given the scope-check below.

**Scope-check result (resolved 2026-06-27):**

- **#221 furniture real GLB is already DONE** (shipped in PR #280, ADR-0095, `engine/scene/furniture-model.ts`,
  `e2e/tests/scene-furniture-model-swap.spec.ts`). The issue is open by oversight; propose closing it. Removed
  from wave 1.
- **#172** era filter is complete + tested (`library-filter.ts` `distinctEras`/`matchesEra`, `EraChips`);
  only **style** filtering remains (above).
- **#85** scale bar is complete (`editor/plan/scale-bar.ts`); the `Compass` graphic exists but is static -
  only **north-arrow binding to `site.northBearing` + a UI setter** remains. Moved to a later wave-1 batch.
- **#205** 3D floor **color already renders** (`PaintMaterialProvider`, tested in `framed-scene.test.ts:300`);
  remaining work is **3D floor selection (pick/highlight) + texture variant**, not "close the render seam."
- **#201** is genuinely multi-slice: window-only marquee (no crossing/alt), group-move covers only
  walls+dimensions, **openings are selected but silently do not move (bug)**, rooms/underlay/snapping absent.
  Natural first slice = fix the opening-move bug. Stays wave 2 behind #202.

### Wave 2 (after wave 1 critical-path roots land)

| Issue                         | Lane | Depends on         | Notes                                                                                             |
| ----------------------------- | ---- | ------------------ | ------------------------------------------------------------------------------------------------- |
| #206 unified 3D view          | D    | #126 (soft)        | View toggle for all-floors render (engine already stacks) + show/hide underground levels          |
| #168 stair tool               | A    | #126 (soft)        | Expose the stair tool in the editor; non-straight tread 2D refinement                             |
| #171 3D vocab renderings      | C    | #170 (hard)        | Render curved openings + trim/feature in 3D                                                       |
| #254 walk interact (E key)    | E    | #253 (soft)        | Opening open/closed view-state; ray from camera; animate opening-fill leaf/sash; E binding        |
| #208 floor-finishes slice     | F    | #205 (soft)        | First split of the finishes epic; design-check first (epic "First step")                          |
| #201 group-move extend        | I    | #202 (lane order)  | Extend marquee/group-move to openings, rooms, and the underlay                                    |
| #336 keyboard-overlay scoping | M    | none               | Apply active-edit-layer scoping to the DOM-overlay proxy                                          |
| #77 a11y clearances           | K    | none               | New clearance layer (turning space, clear-floor-space, route, grab-bar); slot when capacity frees |
| #80 curved walls              | B    | none               | XL, standalone; long-running, start when a worker frees                                           |
| #86 roof/ceilings             | H    | none (soft floors) | XL, standalone; long-running                                                                      |

### Wave 3 (deepest dependents + remaining epics)

| Issue                             | Lane | Depends on               | Notes                                                                                                                         |
| --------------------------------- | ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| #169 stair 3D geometry            | A    | #168 (hard)              | 3D treads/risers/cutaway + floor-by-floor 3D                                                                                  |
| #207 ground plane                 | D    | #206 (hard), #126 (soft) | Grass ground at grade datum; basement above-grade foundation                                                                  |
| #256 transparency refinements     | E    | (after #253/#254)        | Walk-mode gate (part 1), fade attached assets (part 2), consistency (part 3), occlusion-based selection (part 4 = #122 scope) |
| #257 unify camera                 | E    | #253, #256 (hard)        | WASD everywhere; Toggle A = collision; Toggle B = transparency                                                                |
| #258 edge-overlay toggle          | E    | #257 (soft)              | View-level toggle, default off in orbit; lives in #257's display group                                                        |
| #208 interior + exterior finishes | F    | #208 floor slice         | Remaining epic splits (interior wall, exterior wall types)                                                                    |
| #34 PDF auto-generate             | L    | none (soft #202/#85)     | XL vision pipeline; latest; in-memory/wiped ingestion per privacy note                                                        |

---

## Execution protocol (per issue)

Proven pattern from the alpha follow-up run (`memory/alpha-followups-parallel-run-2026-06-25.md`):

- [ ] **Branch + worktree:** create a sibling worktree `vernacular.wt/<branch>` off `origin/main` for the
      issue (`feat/<short-description>` or `fix/<short-description>`). Never work in the main clone. Carry any
      needed untracked state in; clean up after merge.
- [ ] **Constrain file scope:** tell the worktree's subagent the exact allowed files (its lane) and to STOP
      rather than edit shared config or another lane's hot files.
- [ ] **RGB TDD per behavior:** `/test-first` (RED) -> `/implement` (GREEN) -> `/clean-code-review` (BLUE
      review) -> `/refactor` (BLUE refactor, empty marker if nothing actionable). Close each GREEN with a
      refactor commit before the next RED. From the main thread, use the role-separated subagents; inside a
      background worktree, fall back to single-agent RGB (spawned agents cannot dispatch the role-separated
      subagents).
- [ ] **Audit:** `rgb:audit` over `origin/main..HEAD` before opening the PR.
- [ ] **Baselines:** Storybook visual baselines render only on CI (`refresh-story-baselines.yml`, `run:visual`
      label); amd64 chromium crashes under qemu locally. Main thread owns baseline refresh. Recurring NOISE
      baselines to revert: library-launcher, removecontrol.
- [ ] **Merge:** main thread merges worktrees sequentially (independent slice first); refresh the baseline
      between merges; push with `--no-verify` if husky flakes on the two timeout-only tests (CI is the real gate);
      merge PRs with `gh pr merge --merge` after the `ci-complete` gate clears.
- [ ] **Knowledge:** add/refresh an ADR for any architectural change (next free ADR number ~0125; verify with
      `ls docs/knowledge/decisions/`). #268's punted plan reserves 0125 if it ever lands; pick the next free one.

---

## Scope-check results (resolved 2026-06-27)

- **#221 furniture GLB - DONE.** Shipped in PR #280 (ADR-0095). Open by oversight; **propose closing** (needs
  explicit owner sign-off; do not close unilaterally).
- **#172 library filtering - NEAR-DONE.** Era done + tested; only **style** filtering remains. Stays wave 1.
- **#85 north arrow + scale bar - SMALL.** Scale bar done; only the **north-arrow binding + UI setter** remains.
- **#205 room floor color/texture - PARTIAL.** 2D done; **3D color already renders**; remaining = **3D floor
  selection + texture variant**.
- **#201 marquee multi-select - REAL WORK.** Window-only; openings selected-but-don't-move (bug); rooms,
  underlay, crossing, alt-subtract, snapping all absent. Wave 2 behind #202.

---

## Open decisions / waiting on the owner

1. **Sign-off on this DAG + wave grouping** before any building starts.
2. **GitHub write authorization** for the beta run (push / PR / merge / issue + board edits) - not yet
   re-granted this session.
3. **Wave-1 concurrency** - how many live worktrees to run at once (recommend 3-6). Suggested first batch:
   #126, #253, #170 (critical-path roots) + #335, #320, #202 (quick disjoint wins).
4. **#208 finishes epic** - its own "First step" says check for an existing design first; confirm whether to
   split it into child issues now or after the #205 floor-finishes slice proves the seam.
5. **#34 PDF pipeline** and **#80 / #86 XL items** - confirm they stay in scope for beta or get split further.
6. **#268 stays punted; do not touch.**
