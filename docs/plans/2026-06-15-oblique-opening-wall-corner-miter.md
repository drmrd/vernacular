# Oblique opening-wall corner miter: implementation plan

**Goal:** Make a wall that hosts an opening miter its ends to the shared footprint, the same way a plain wall already does, so oblique seams (such as a bay's) close in the 3D model.

**Architecture:** `buildWalls` already computes the mitered `wallFootprints` for every edge but only feeds them to the no-opening prism path. The opening path (`buildOpeningWallMesh`) builds the wall from a square `[0, length] x [0, height]` elevation and ignores the footprint. This plan threads the edge's footprint into the opening path and remaps the outer-boundary end columns to the mitered corners, leaving the opening voids and reveals untouched.

**Tech stack:** TypeScript, Three.js (engine layer), Vitest. Executed through the project red-green-blue subagents (test-author, implementer, refactorer) driven from the main thread.

**Files:**

- Modify: `engine/scene/wall-builder.ts` (thread the footprint; remap the end columns in the edge-local-to-world mapping).
- Test: `engine/scene/wall-builder.test.ts` (new cases; reuse `wall-test-support.ts`).
- Reference (read-only): `core/topology/wall-footprint.ts` (`wallFootprints`, `WallFootprint`), `engine/scene/wall-test-support.ts` (`maxAxisOfRole`, `centeredOpening`, `horizontalWall`, `THICKNESS`, `HALF_THICKNESS`, `WALL_LENGTH`, `HEIGHT`, `PRECISION`, `meshesOf`).

**Background facts (verified):**

- A plain wall already miters: the existing test `miters the shared corner of two plain walls meeting at a right angle` asserts wall A's interior face reaches `WALL_LENGTH - HALF_THICKNESS` and its exterior face reaches `WALL_LENGTH + HALF_THICKNESS`.
- An opening wall today squares both ends, so both faces stop at `WALL_LENGTH`.
- A mitered corner sits on the same `+/- half` perpendicular face line as the square corner; only its along-distance shifts.

---

## Cycle 1: opening walls miter their ends to the footprint

One GREEN (the remap) makes the miter work at every angle, so this is a single cycle. Its RED carries three cases in one `describe('buildWalls opening-wall miter')` block: the oblique seam (the actual issue), a right-angle corner (axis-aligned mechanism check), and a free-end guard (graceful degradation). The first two fail today; the third already passes and rides along as a characterization assertion.

**Files:** Modify `engine/scene/wall-builder.ts`; tests in `engine/scene/wall-builder.test.ts` (reuse `wall-test-support.ts`).

- [ ] **Step 1 (RED, test-author): failing tests.**

  Case A, oblique seam (primary). Build a two-way corner where wall A is horizontal from `(0,0)` to `(WALL_LENGTH,0)` and wall B leaves the shared vertex `(WALL_LENGTH,0)` at an oblique angle (for example to `(WALL_LENGTH + 1000, 1000)`, a 135-degree interior turn), both `THICKNESS`/`HEIGHT`, with `openingsByWall = new Map([['a', [centeredOpening()]]])`. Compute the truth from the public `wallFootprints(graph, thicknessByEdge)`: wall A's `bPlus` and `bMinus` are its mitered corners at the shared vertex. Assert wall A's built faces reach them: `maxAxisOfRole(meshA, 'interiorFace', 'x')` is close to `A.bPlus.x` and `maxAxisOfRole(meshA, 'exteriorFace', 'x')` is close to `A.bMinus.x` (PRECISION). Today both are `WALL_LENGTH` (square), so this fails.

  Case B, right-angle corner. The existing plain-wall L graph (wall A east, wall B north from `(WALL_LENGTH,0)`), but give A a `centeredOpening()`. Assert `maxAxisOfRole(meshA, 'interiorFace', 'x')` is close to `WALL_LENGTH - HALF_THICKNESS` and `maxAxisOfRole(meshA, 'exteriorFace', 'x')` is close to `WALL_LENGTH + HALF_THICKNESS` (PRECISION), mirroring `miters the shared corner of two plain walls meeting at a right angle`. Fails today.

  Case C, free-end guard. A single free-standing opening wall (`singleWallMesh([centeredOpening()])`, both ends incidence 1). Assert both faces still reach `WALL_LENGTH` at the b end (PRECISION). Already passes; pins that the remap leaves un-mitered ends square.

- [ ] **Step 2: run, expect RED.**
      `pnpm exec vitest run engine/scene/wall-builder.test.ts`. Cases A and B fail (square ends), case C passes, all pre-existing tests pass.

- [ ] **Step 3 (GREEN, implementer): thread the footprint and remap the end columns.**
      In `buildWalls`, pass the edge's `footprints[index]` into the opening path (extend `OpeningWall` / `buildOpeningWallMesh` to carry the `WallFootprint`).
      Compute four along-distances by projecting each footprint corner onto the edge `along` axis from `frame.a`: `uAPlus = dot(subtract(aPlus, a), along)`, and likewise `uAMinus`, `uBPlus`, `uBMinus` (reuse `dot`/`subtract` from `core/geometry/vector`).
      In the world mapping (`edgeLocalToWorld`, or a thin wrapper that the long-face, cap, and end-cap builders all call), when an outline point's `u` equals `0` substitute the a-end mitered along for that side (`+normal`/interior -> `uAPlus`, `-normal`/exterior -> `uAMinus`); when `u` equals `length` substitute the b-end (`uBPlus`/`uBMinus`). Interior void-corner points (`0 < u < length`) keep their `u`. The perpendicular offset stays `side * thickness / 2`. A square footprint yields `uAPlus = uAMinus = 0` and `uBPlus = uBMinus = length`, so un-mitered ends do not move.

- [ ] **Step 4: run, expect GREEN.**
      `pnpm exec vitest run engine/scene/wall-builder.test.ts` passes (all three new cases plus the existing plain-wall miter, void, and reveal tests).

- [ ] **Step 5: focused check.**
      `pnpm exec tsc --noEmit` clean; `pnpm lint` no new problems in `engine/scene/wall-builder.ts`.

- [ ] **Step 6 (BLUE, clean-code-reviewer then refactorer): review the diff, apply findings or land an empty `refactor:` marker.**

Commit sequence: `test:` (RED), `feat:` (GREEN), `refactor:` (BLUE).

---

## After the cycles

- [ ] **Author ADR-0090** under `docs/knowledge/decisions/` recording the decision (opening-wall ends honor the mitered footprint; degrades to square for un-mitered ends). Humanize the prose (Rule 17). Commit `docs:`.
- [ ] **Full gate:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, then `node scripts/rgb-audit/rgb-audit.mjs --range origin/main..HEAD`, `pnpm integration:audit`, and the scene-webgl e2e project (`E2E_BASE_URL=http://localhost:<free-port> pnpm exec playwright test --project=scene-webgl`). Confirm the committed scene baselines are unchanged.
- [ ] **PR** with a humanized description and `Fixes #197`; rebase onto `origin/main` and re-check the diff before pushing (worktrees share the main clone's `.git`); merge when CI is green; clean up the worktree and branches.

## Decomposition note

`wall-builder.ts` is already a large file (about 413 lines). Keep the new helpers small and local. If the file crosses the lint cap, prefer extracting the end-offset computation into a small named helper rather than splitting the file mid-slice.
