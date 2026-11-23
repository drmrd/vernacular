# The geometric kernel and the first arc wall: implementation plan

> **For agentic workers:** run every cycle from the main thread with the role-separated agents of
> this repository: `/test-first`, `/implement`, `/clean-code-review`, `/refactor`. A background
> agent cannot dispatch them. Tick the checkboxes as the work lands. Pull request 1 is a trial on a
> branch that never merges; it follows test first but is not held to `rgb:audit`.

**Goal:** close #674, #681, and #546, deliver the first slice of #80 (one arc wall made by bending a
straight wall), and meet every "Done when" list of the specification, so that #687 can close. The
trial that ADR-0097 asked for runs first and decides the inner form of the plan geometry.

**Architecture:** one trial and 17 code pull requests in nine lanes. The owner decided on 19
November 2026 that the work that does not read or shape the plan geometry runs beside the trial,
not after it. So the trial, the tolerance module (2), and the wall path
accessor (5) start together; property tests (3) and exact lengths (4) start when 2 has merged; the
path's three moves (6, 7, then 8) follow 5. After the owner approves ADR-0200, the plan geometry
lands (9); the plan and the 3D view move to it in two parallel lanes (10, 11) while overlap (12)
lands beside them; exact junctions (13) follow 12; room records (14) and arc paths (15) then run side
by side. The arc reaches users in 18, after 16 and 17.

**Tech stack:** TypeScript, Vitest (unit project), fast-check (new development dependency in pull
request 3), the TypeScript compiler API for one architecture test, Playwright journeys, Storybook
story baselines, the scene harness.

**Spec:** `docs/specs/2026-11-18-geometric-kernel-and-first-arc-wall.md` (the approved specification;
this plan cites its sections as "spec 5.3"). Records: ADR-0199, ADR-0201, ADR-0202, ADR-0203 are
planned and not yet written; they land in a documents-only pull request with the umbrella's four
edits (spec section 8), before the trial and the first code pull request start ("the records'
documents pull request" below). ADR-0200 lands with the trial's result. Also ADR-0097, ADR-0178, ADR-0181, ADR-0186,
ADR-0218. Read the spec section named in each pull request before starting it.

**Base:** `main` at `8d922cf2`; the cited paths and line numbers were checked again against `main`
at `82170819` on 2026-11-20. Before each pull request, check the names and line numbers below
against `main`. Where one differs, use the landed name and say so in the description.

## Global constraints

- Every document from schema version 8 onward still opens after every pull request. The format
  suites under `tests/format/` check this; each version step adds its fixture.
- No pull request from 9 on starts before the owner has approved ADR-0200.
- The trial leaves no production code and no test on `main`.
- No new runtime dependency. fast-check is the one development dependency: pin the newest version
  that is at least 30 days old on the day of pull request 3 (`pnpm view fast-check time`), exact,
  and name it in the description.
- Application code follows red, green, blue: `test:`, then `feat:` or `fix:`, then `refactor:` (an
  empty marker when the review finds nothing). A pure move under green tests (pull requests 6, 7,
  and parts of 8, 10, 11) is a `test:` commit that tightens the check, then one `refactor:` commit.
  A GREEN commit changes no test file; a moved or deleted test file changes in the RED commit.
  Characterization properties that pass on `main` (pull request 3) are `test:` commits.
- A `test:` commit that is not a cycle's RED (a journey, a benchmark) is `test(e2e):` or lands after
  the cycle's `refactor:` commit.
- Each pull request passes `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
  `pnpm build`, `pnpm schema:check`, and `node scripts/rgb-audit/rgb-audit.mjs --range origin/main..HEAD`,
  each checked for its own exit code. `/clean-code-review` and `/review` run before it merges. It
  merges with a merge commit.
- A pull request that moves a baseline says which and why. Story baselines render on the CI runner:
  use the refresh workflow and the `run:visual` label. Count baselines under `tests/performance/`
  are updated with the gate's update mode and explained.
- New prose in a specification or a decision record passes through the `humanizer` skill.
- No file of the session layer fence (below) is edited. No edit of a command handler file outside
  the list of shared files.

## Decisions this plan makes

The spec leaves these to the builder. They are fixed here so that two lanes cannot choose
differently.

1. **The tolerance module is `core/geometry/tolerance.ts`.** It exports the derived values
   (`LENGTH_TOLERANCE_MM = 0.001`, `ANGLE_TOLERANCE_RAD = 1e-8`,
   `DERIVED_COORDINATE_GRID_MM = LENGTH_TOLERANCE_MM / 1000`, `SUPPORTED_EXTENT_MM = 1_000_000`,
   `SMALLEST_IMPERIAL_DISPLAY_STEP_MM = 25.4 / 256`, `SMALLEST_METRIC_DISPLAY_STEP_MM = 0.1`), the
   input rule `JOIN_DISTANCE_MM = 1`, and today's constants under named entries. Two names that
   `core/index.ts` exports keep their names so that no importer of `core/index.ts` changes:
   `DEFAULT_JUNCTION_TOLERANCE_MM` and `ROOM_RING_TOLERANCE_MM`. `OUTLINE_TOLERANCE_MM`, now exported
   from `core/daylight/room-validation.ts`, is imported from the module by the two daylight files. One constant, `DERIVATION_LENGTH_TOLERANCE_MM`,
   is the length the derivation compares with: `DEFAULT_JUNCTION_TOLERANCE_MM` (1) until pull
   request 13, `LENGTH_TOLERANCE_MM` after. Every predicate added before 13 uses it, so 13 has one
   switch. Pull request 13 also adds two frozen entries for the migration's copy of the old graph,
   `LEGACY_JUNCTION_MERGE_MM = 1` and `LEGACY_PARALLEL_CROSS_LIMIT = 1e-9`, each with the reason
   "migration to version 18, never changes".
2. **The list of other distances is `tests/architecture/other-distances.ts`**, an array of
   `{ name, file, reason }`, read by `tests/architecture/one-tolerance-module.test.ts`. The test
   flags a `const` whose name matches `/(^|_)(EPS|EPSILON|TOLERANCE)(_|$)/`, a comparison with a
   literal `<n>e-<m>`, and any numeric `const` below 1e-3 declared in `core/geometry/`,
   `core/topology/`, `core/scene/`, or `engine/scene/`, outside the module.
3. **The wall path is `core/geometry/wall-path.ts`.** A path is a plain frozen value with a `kind`.
4. **The wall end rule is `tests/architecture/wall-ends-through-the-path.test.ts`**, over the
   TypeScript program of `tsconfig.json`, with its exception list in
   `tests/architecture/wall-end-read-exceptions.ts` (an array of repository-relative paths). It
   flags a property access or a destructuring of `start` or `end` on a value whose type is `Wall`
   (`core/model/types.ts`) or `WallSceneNode` (`core/scene/scene-graph.ts`), in a production file
   outside `core/geometry/`, `core/topology/`, and `core/migrations/`. The list must equal the set of
   flagged files exactly, so a stale entry fails too.
5. **The plan geometry is `core/topology/floor-plan-geometry.ts`**, with the network builder
   `deriveWallNetwork` and the memo `createPlanGeometryDeriver`. The scene graph field is
   `planGeometry: FloorPlanGeometry[]`, one per floor in floor order.
   5a. **One wall network memo, `wallNetworkFor`, in `core/topology/wall-network-memo.ts`** (spec 5.3,
   point 9). It is keyed by the wall list and the registries object in two nested `WeakMap`s, and it
   counts its builds in `wallNetworkBuildCount()`. Every reader of a network goes through it: the
   plan geometry deriver, the pure projection, and the room record step. Tests of "built once" read
   the count before and after.
6. **The approximate mark is a leading `≈ ` (U+2248 and a space).** `formatLength` and
   `formatAdaptiveLength` return the marked text; `formatLengthParts` and
   `formatAdaptiveLengthParts` return `{ text, exact }` with the unmarked text. The visual review of
   the `exact` flag is the tested contract. The owner decided the glyph on 2026-11-23.
7. **Imperial input steps:** grid, keyboard candidate, and nudge 101.6 mm (4 inches); large nudge
   914.4 mm (3 feet). Metric: 100 mm and 1000 mm. The visible imperial grid steps through 1, 4, and
   12 inches, then 4, 8, 16, and 32 feet; the metric grid keeps today's series.
8. **Refusal texts of the Length field:** "Enter a length greater than zero." and "The wall would end
   before an opening." The merge line of spec 5.5: "Part of this wall was already there." (and
   "This wall was already there." when nothing is added).
9. **Room ids:** `room:record:<recordId>` for a room with a record, `room:faces:<faces>` for one
   without, where `<faces>` is the sorted list of `<wallId>:<side>` joined with `|`. `ROOM_ID_PREFIX`
   stays `room:`.
10. **The arc field is `Wall.curve?: { kind: 'arc'; bulge: number }`**, `0 < |bulge| <= 1`.
11. **The room record wrapper is `core/commands/room-record-binding.ts`.** The binding and the
    rewrite stay in `core/topology/room-records.ts`, so that topology does not import commands.
12. **Decided on 19 November 2026:** pull requests 2 to 8 run beside the trial (spec 6).
    **Decided on 2026-11-23** (the owner, spec sections named): the anchor condition for a binding
    score below one (spec 5.6, point 3); the smallest arc radius, equal to the resolved thickness
    (spec 5.7); the kernel and the command layer land in the order of spec 6, neither waiting for
    the other (spec 11, point 7); the umbrella's typed-length wording (spec 11, point 1); and the
    glyph that marks an approximate length, a leading `≈ ` (the tests check the `exact` flag, not
    the glyph).
    **Working assumptions on open points** (the owner decides each; spec sections named): the
    adoption rule of the trial (spec 5.3, the trial, point 5); the reading of the hole criterion
    (spec 11, point 10); whether the owner schedules the timing run M9 at the end of the trial
    (spec 5.3, the trial, point 4). A different answer changes the cycles that cite the point.

## Review focus

Inputs most likely to hurt a user, most likely first. Each has a test in the cycle named.

1. **An old project whose corners are 0.001 to 1 mm apart opens with the same rooms.** Cycle 13.3,
   `keeps the rooms of a corner whose ends were 0.4 mm apart`; the report of cycle 13.6 over every
   fixture.
2. **A named room keeps its name when a stub, a split, or a drag touches its walls.** Cycle 14.5,
   one test per row of spec 5.6 point 5.
3. **Lengths that change their label.** Cycle 4.2 and the story baselines of pull request 4: a
   default imperial project must show exact labels for walls drawn on the grid.
4. **The trial passes on fixtures but misses a case.** Cycle 9.3 keeps a parity test against a
   frozen copy of today's walk until cycle 12.1 deletes both on purpose.
5. **Deleting the outside wall of a named room.** Cycle 14.5, `no neighbor takes the record of a
room whose outside wall was deleted`.
6. **A line-to-arc miter puts a corner off.** Cycle 15.4, `the miter corner lies on both face curves`.

---

## Order and lanes

| #   | Pull request                                   | Branch                                                                              | Issues                  | Lane       | Starts after                        | Cycles                          |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- | ---------- | ----------------------------------- | ------------------------------- |
| 1   | The trial of explicit half-edges               | `feat/half-edge-face-walk-trial` (never merged), then `docs/half-edge-trial-result` | #687, #80               | Trial      | the records' documents pull request | 2 to 3 lane-days (time box 3)   |
| 2   | One tolerance module                           | `feat/geometry-tolerance-module`                                                    | #687                    | Tolerance  | the spec                            | 2                               |
| 3   | Property tests for the derivation              | `test/property-tests-for-plan-derivation`                                           | #687                    | Properties | 2                                   | 4                               |
| 4   | Exact lengths that read back                   | `feat/exact-length-read-back`                                                       | #687                    | Lengths    | 2 (4.9 after 3)                     | 9                               |
| 5   | The wall path accessor                         | `feat/wall-path-accessor`                                                           | #687                    | Path       | the spec                            | 4                               |
| 6   | `core/` reads walls through the path           | `refactor/core-reads-walls-through-the-path`                                        | #687                    | Path       | 5                                   | 3                               |
| 7   | The editor reads walls through the path        | `refactor/editor-reads-walls-through-the-path`                                      | #687                    | Path (b)   | 5, and 4 for shared files           | 3                               |
| 8   | Scene nodes carry the wall path                | `refactor/scene-nodes-carry-the-wall-path`                                          | #687                    | Path       | 6 and 7                             | 3                               |
| 9   | One plan geometry per floor                    | `feat/floor-plan-geometry`                                                          | #674, #687              | Geometry   | 1 (ADR-0200 approved), 3, 5         | 9 (fallback) or 12 (half-edges) |
| 10  | The plan and the export read the plan geometry | `refactor/plan-and-export-read-the-plan-geometry`                                   | #546                    | Plan       | 9 and 7                             | 6                               |
| 11  | The 3D walls read the plan geometry            | `refactor/three-dimensional-walls-read-the-plan-geometry`                           | #687, the new tee issue | 3D         | 9 and 8                             | 7                               |
| 12  | Overlapping walls keep their rooms             | `fix/overlapping-walls-keep-their-rooms`                                            | #681                    | Geometry   | 9                                   | 6                               |
| 13  | Exact junctions under the length tolerance     | `feat/exact-junctions-under-the-length-tolerance`                                   | #687                    | Geometry   | 12 and 2                            | 9                               |
| 14  | Room records with a stable identity            | `feat/room-records-with-stable-identity`                                            | #687                    | Geometry   | 13                                  | 10                              |
| 15  | Arc paths in the plan geometry                 | `feat/arc-paths-in-the-plan-geometry`                                               | #80                     | Arc        | 13 and 8                            | 7                               |
| 16  | Arc walls in the plan and the export           | `feat/arc-walls-in-the-plan-and-export`                                             | #80                     | Plan       | 15 and 10                           | 4                               |
| 17  | Arc walls in three dimensions                  | `feat/arc-walls-in-three-dimensions`                                                | #80                     | 3D         | 15 and 11                           | 5                               |
| 18  | Bend a wall into an arc                        | `feat/bend-a-wall-into-an-arc`                                                      | #80, #687               | Arc        | 4, 14, 16, 17                       | 8                               |

**Size, as an estimate.** 99 cycles in the code pull requests if ADR-0200 takes the fallback, 102 if
it adopts half-edges, plus three journeys. Many cycles hold more than one behavior (for example 3.4,
5.3, 8.2, 13.4, 13.5, 14.1, 15.1, 15.5, 18.2, 18.5); written one behavior per test they come to about
125 to 130. The longest chain after the trial is 9, 12, 13, 15, 17, 18: 44 cycles (fallback) or 47
(half-edges), about 55 to 60 if split. 14 runs beside 15 and 17 and is shorter than them (10 against
12).

**Lane-days, as an estimate.** The session layer stage ran about 8 to 12 cycles per lane-day with
its reviews and fix rounds (its pull requests #816, #824, #841, #875, and #886 held 29 cycles in
about two and a half days), but that work was mostly plumbing. For exact geometry, migrations, and
baselines that refresh on the CI runner, this plan assumes 6 to 10 cycles per lane-day. The low end
is 99 cycles at 10 a day plus a trial of two days, about 12 lane-days. The high end is 130 cycles at
6 a day plus a trial of three days, about 25. So: about 12 to 25 lane-days of work in all, most
likely 15 to 20. The longest chain takes about 5 to 10 lane-days after the owner approves ADR-0200,
which itself comes after the trial and his reading of its report. Nothing here was measured.

**Parallel lanes** (2 to 8 run beside the trial, as the owner decided on 19 November; spec
section 6). While the trial runs: 2 and 5 at once; then 3 and 4 when 2 has merged, with 6 and 7 side by side
after 5; then 8. Up to four kernel lanes run at once in that window, and pull request 8 retrofits
about 65 files, mostly tests, which adds to the review load. After ADR-0200: 9; then 10, 11, and 12
side by side; 13 after 12; then 14 beside 15; 16 beside 17; 18 last. Where two lanes edit one file,
the second to merge rebases (table below).

Not taken from the review: running 13 and 14 side by side. Both are version steps; each regenerates
`schema/`, `core/model/known-keys.json`, and the generated validators and adds a version fixture,
and the migration test of 14 runs over the output of 13. In parallel they collide in every one of
those files, and the second must regenerate them all. The nine cycles that the chain would gain do
not pay for that.

**The session layer fence.** The kernel edits none of these, which belong to the session layer
plan's pull requests 6, 7, and 10 to 14 (its 8 and 9 are on `main` as #946 and #937): `session/` (all of it), `storage/` (all), `app/` (all, except
`app/harness-paint.test.ts` in pull request 8 and one entry in `app/harness-environment.ts` in pull
request 18; tell the session layer lanes before each), `src/`, `core/repairs/` (planned by the session layer plan),
`core/format/best-effort-read.ts`, `editor/projects/` (planned by the session layer plan), `editor/shell/project-menu.tsx`,
`editor/shell/export-menu.tsx`, `editor/shell/editor-shell.tsx`, `editor/shell/shell-providers.tsx`,
`editor/design-system/theme-provider.tsx`, `editor/design-system/theme.ts`,
`editor/shell/theme-toggle.tsx`, `editor/plan/snap-preferences.ts`,
`editor/plan/snap-preferences-store.ts`, `bridge/react/settings-context.ts`,
`tests/architecture/storage-globals.test.ts`, `tests/storage/`, `eslint.config.js`,
`vitest.config.ts`, `.github/workflows/`. The session plan also fences `core/export/svg/` for its
identity lane without listing it as shared. Before kernel pull request 6 opens, tell that lane, so
that its shared table gains the row "`core/export/svg/`: session layer 6 and 7, kernel 6, 10, 14, 16; the
second to merge rebases".

**The command layer.** Its first pull request touches every handler file mechanically. If it is
ready before kernel pull request 6, 12, 14, or 18, it merges first and the kernel rebases. If the
kernel's is ready first, it merges and the command layer rebases. Neither waits. The owner decided on
2026-11-23 that the kernel as a whole need not land before the command layer (spec section 11, point 7).

| File                                                                                                                  | Edited by, in merge order                                                              |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `core/index.ts`                                                                                                       | 2, 4, 5, 9, 12, 13, then 14 and 15 as they merge; session layer 6 and 12 as they merge |
| `core/geometry/tolerance.ts`                                                                                          | 2, 12, 13, 15                                                                          |
| `core/geometry/wall-path.ts`                                                                                          | 5, 6, 15, 18                                                                           |
| `core/model/types.ts`                                                                                                 | 14, 18                                                                                 |
| `core/model/factories.ts`                                                                                             | 13, 14, 18 (each takes the next number at merge time)                                  |
| `core/migrations/schema/index.ts`                                                                                     | 13, 14                                                                                 |
| `schema/`, `core/model/known-keys.json`, `core/format/generated/`                                                     | 13, 14, 18; any front-view revision as it merges                                       |
| `tests/format/schema-drift.test.ts` (the reminder case)                                                               | 13, 14, 18; any front-view revision as it merges                                       |
| `tests/fixtures/projects/versions/`                                                                                   | 13, 14                                                                                 |
| `core/scene/scene-graph.ts`                                                                                           | 6, 8, 9, 14                                                                            |
| `core/scene/scene-graph-assembly.ts`                                                                                  | 9, 14                                                                                  |
| `core/scene/scene-graph-deriver.ts`                                                                                   | 9, 14; the command layer as it merges                                                  |
| `core/scene/wall-room-sides.ts`                                                                                       | 2, 6, 11, 13                                                                           |
| `core/topology/floor-plan-geometry.ts`, `wall-network-memo.ts`                                                        | 9, 12, 13, then 14 and 15 as they merge                                                |
| `core/topology/wall-graph.ts`, `rooms.ts`, `wall-footprint.ts`, `junction-fill.ts`                                    | 2, 9, 12, 13, then 14 and 15 as they merge (14 edits `rooms.ts` only)                  |
| `core/export/svg/svg-plan-exporter.ts`, `svg-view.ts`, `svg-plan-exporter-test-fixtures.ts`                           | 6, 10, 14, 16; session layer 6 and 7 as they merge                                     |
| `core/commands/handlers/wall-commands.ts`                                                                             | 12, 18; the command layer as it merges                                                 |
| `core/commands/handlers/room-commands.ts`, `register-all-project-commands.ts`, `core/commands/room-record-binding.ts` | 14; the command layer as it merges                                                     |
| `core/commands/handlers/transform-commands.ts`                                                                        | 6; the command layer as it merges                                                      |
| `core/commands/handlers/opening-commands.ts`                                                                          | 18; the command layer as it merges                                                     |
| `core/commands/testing/`                                                                                              | 14, 18; the command layer as it merges                                                 |
| `editor/plan/length-field.tsx`                                                                                        | 4, 18                                                                                  |
| `editor/shell/inspector.tsx`                                                                                          | 4, 8, 14, 18                                                                           |
| `editor/plan/draw-plan.ts`                                                                                            | 4, 7, then 10 and 12 as they merge, then 16                                            |
| `editor/plan/snap.ts`, `use-snapping.ts`                                                                              | 4, 7, 10, 16                                                                           |
| `editor/plan/use-wall-editing.ts`                                                                                     | 4, 7, 13, 18                                                                           |
| `editor/plan/use-plan-interaction.ts`, `authoring-tool-handlers.ts`                                                   | 4, 12, 13                                                                              |
| `editor/plan/plan-view.tsx`, `use-selection-move.ts`, `ruler.ts`, `ruler-label-spacing.ts`                            | 4; `plan-view.tsx` also the command layer as it merges                                 |
| `engine/scene/wall-builder.ts`, `wall-prism.ts`                                                                       | 2, 8, 11, 17                                                                           |
| `engine/scene/wall-scene-helpers.ts`                                                                                  | 5, 11                                                                                  |
| `engine/scene/near-wall-run-owner.ts` (pins only; no edit expected)                                                   | 13                                                                                     |
| `app/harness-paint.test.ts`                                                                                           | 8                                                                                      |
| `package.json`, `pnpm-lock.yaml`                                                                                      | 3; session layer 6 as it merges                                                        |

Documents that change with the code:

| Document                                                                         | Where                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ADR-0200 and a note in ADR-0097                                                  | 1 (documents pull request)                                                 |
| ADR-0218 (the room ring) and ADR-0134 (the grid as a share of the tolerance)     | 2, texts                                                                   |
| ADR-0181 consequence (the Length field), design spec section on units            | 4, texts                                                                   |
| ADR-0034 (seam 2 exists)                                                         | 5, texts                                                                   |
| ADR-0018, ADR-0137 (the plan geometry on the scene graph, resolved thickness)    | 9, texts                                                                   |
| ADR-0080, ADR-0082 (one fan), ADR-0218 (faces), ADR-0058 (where holes are found) | 11, texts (ADR-0058 in 9 if the fallback keeps the containment pass there) |
| ADR-0026 (overlap in scope)                                                      | 12, texts                                                                  |
| ADR-0026 (the merge moved to input), format spec section 7 note for version 18   | 13, texts                                                                  |
| ADR-0036 superseded in part, design spec 3.2, format spec on `roomOverrides`     | 14, texts                                                                  |
| ADR-0047 and format spec 6.5 (`wall.curve` defined), design spec 2.4             | 18, texts                                                                  |
| The umbrella's four edits (spec section 8)                                       | the records' documents pull request                                        |
| Skill notes under `.claude/skills/` (wall graph, room keys, tolerances)          | after 9, 13, 14 (the owner edits; agents cannot write there)               |

---

## Pull request 1: the trial of explicit half-edges (#687, #80)

Spec 5.3, "What the trial can and cannot show" and "The trial", points 1 to 8. The trial ports room
derivation to an explicit half-edge structure on a branch that never merges, and measures it
against today's walk and against the fallback (today's graph with one shared fan). Its only product
on `main` is ADR-0200, which holds the report, in a documents-only pull request.

**Where:** branch `feat/half-edge-face-walk-trial` from `main`, in a sibling worktree. Push it so
the reviewers can read it. Open no pull request against `main` from it. CI does not run on it
(`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`), so the reviewers rerun
its tests locally. Keep the branch until pull request 9 merges, then delete it.

**Files on the trial branch (all `core/`, none merges):** `core/topology/half-edge-structure.ts`,
`core/topology/half-edge-rooms.ts`, `core/topology/shared-fans.ts`, their tests
`core/topology/half-edge-structure.test.ts`, `core/topology/half-edge-trial-parity.test.ts`,
`core/topology/half-edge-trial-counts.test.ts`, `core/topology/half-edge-trial-components.test.ts`,
and, if pull request 3 has not merged, a plan generator `core/topology/trial-plan-generator.ts`
(otherwise use `core/topology/plan-arbitraries-test-support.ts` from 3). Edits on the branch only:
`core/topology/wall-footprint.ts` and `core/topology/junction-fill.ts` take a fan from outside, and
`core/topology/rooms.ts` (`deriveRooms`, `assignHoles`) takes an optional observer, so that today's
walk and the fallback can be counted.

**Files of the documents pull request:** `docs/knowledge/decisions/ADR-0200-<slug>.md` (new: the
decision, the filled table of spec 5.3 point 4 with both columns, the defects of today's walk, the
head commit of the trial branch, and each rerun command with its exit code),
`docs/knowledge/decisions/ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry.md` (a
dated note that points to ADR-0200).

**Interfaces on the trial branch:**

```ts
// core/topology/half-edge-structure.ts
export interface TrialObserver {
  fanComputed?(junction: number): void
  containmentTest?(): void // one call per point-in-face or room-pair containment test
  passOverRooms?(name: string): void
}
export interface HalfEdge {
  readonly index: number
  readonly origin: number // junction index
  readonly twin: number
  readonly next: number // next half-edge around the face on its left
  readonly face: number
  readonly edge: number // index into PlanarGraph.edges
  readonly wallId: string
}
export interface HalfEdgeFace {
  readonly index: number
  readonly outer: number | undefined // one half-edge of the outer cycle; undefined for an unbounded face
  readonly inner: readonly number[] // one half-edge per inner cycle (holes and free-standing loops)
  readonly component: number
}
export interface HalfEdgeStructure {
  readonly graph: PlanarGraph
  readonly halfEdges: readonly HalfEdge[]
  readonly faces: readonly HalfEdgeFace[]
  /** Junction to its outgoing half-edges, sorted counterclockwise by leaving direction. */
  readonly fans: ReadonlyMap<number, readonly number[]>
  /** Connected components as lists of edge indexes. */
  readonly components: readonly (readonly number[])[]
}
export function buildHalfEdgeStructure(
  graph: PlanarGraph,
  observer?: TrialObserver,
): HalfEdgeStructure
// core/topology/half-edge-rooms.ts
export function deriveRoomsFromHalfEdges(walls: readonly Wall[], observer?: TrialObserver): Room[]
export function deriveRoomsForComponent(walls: readonly Wall[], component: number): Room[]
// core/topology/shared-fans.ts (used by both designs)
export function junctionFansOf(
  graph: PlanarGraph,
  observer?: TrialObserver,
): ReadonlyMap<number, readonly number[]>
export function wallFootprintsFromFans(
  graph: PlanarGraph,
  fans: ReadonlyMap<number, readonly number[]>,
  thicknessByEdge: number[],
): WallFootprint[]
export function junctionFillsFromFans(
  graph: PlanarGraph,
  fans: ReadonlyMap<number, readonly number[]>,
  thicknessByEdge: number[],
): JunctionFill[]
// core/topology/rooms.ts on the branch: deriveRooms(walls, options?: { tolerance?: number; observer?: TrialObserver })
```

### Step T1: the structure holds

- [ ] Test: Given every room fixture under `core/topology/` and `core/scene/`, the project fixtures
      under `tests/fixtures/projects/` (corpus and version fixtures included), and the reference
      project (`createReferenceProject`, `tests/performance/reference-project.ts`), when
      `buildHalfEdgeStructure(buildWallGraph(walls))` runs per floor, then `twin(twin(h)) === h`,
      `halfEdges[twin].origin` is the head of `h`, every `next` chain closes, every half-edge lies on
      exactly one face, and junctions minus edges plus faces equals one plus the number of components.
- [ ] Code: the structure.

### Step T2: the same rooms (M1)

- [ ] Test, `half-edge-trial-parity.test.ts`: for the same inputs and for 2,000 generated plans,
      `deriveRoomsFromHalfEdges(walls)` equals `deriveRooms(walls)`: ids, `wallIds`, polygon corners
      (within 1e-6 mm, after aligning the start corner), clear and outer polygons, areas (within
      1e-6 mm²), holes. A difference is printed with the plan.
- [ ] Code: the walk on the structure, holes as inner cycles, one point-in-face test per free-standing
      component.
- [ ] Each remaining difference is either fixed or written down as a defect of today's walk, with the
      plan that shows it.

### Step T3: footprints and fills from one fan (M2, and the fallback's fan)

- [ ] Test: `wallFootprintsFromFans` and `junctionFillsFromFans`, given `junctionFansOf(graph)` or the
      structure's fans, equal `wallFootprints` and `junctionFills` on the same inputs, within
      `DERIVED_COORDINATE_GRID_MM` (1e-6 mm).
- [ ] Code: the shared fan function and the two functions that read it. The fallback uses the same.

### Step T4: the counts (M3, M4)

- [ ] Test, `half-edge-trial-counts.test.ts`: on the reference project, with a `TrialObserver`:
      (a) today's `deriveRooms`, `wallFootprints`, and `junctionFills` together report four fan
      computations per floor, and `assignHoles` one pass over rooms with its count of containment
      tests; (b) the fallback (today's walk, `junctionFansOf`, and the two `FromFans` functions)
      reports one fan computation and the same containment count as today; (c) half-edges report one
      fan computation, one containment test per free-standing component, and no pass over rooms.
      The same three counts on 200 generated plans with holes, as totals. The report states the fifth
      fan site (`core/scene/junction-fade.ts:121`) from the code; no trial step moves it.

### Step T5: one component at a time (M5)

- [ ] Test, `half-edge-trial-components.test.ts`: Given a plan of two separate buildings, when one
      wall of the first moves, then the rooms of the second from `deriveRoomsForComponent` equal those
      of a fresh build, record for record. Given a free-standing loop inside a room, when a wall of the
      loop moves, then the outer room's holes and area change and no other room's record does. The
      report says whether the same cut works for today's graph without half-edges.

### Step T6: derived and not stored (M6)

- [ ] Test: every record that `buildHalfEdgeStructure` returns is frozen, and a write in strict mode
      throws; two calls on the same input return deep-equal results. The reviewer checks that
      `git diff main -- core/model schema` is empty and the report says so.

### Step T7: the report and ADR-0200

- [ ] Count production lines under `core/topology/` for today, the fallback (today plus
      `shared-fans.ts`), and half-edges, without tests (M7).
- [ ] List the structural links of M8 (an opening to its edge, a wall face to its rooms, a room to its
      holes): for each, the consumer in this stage that would read it (spec sections 5.3, 5.6) and how
      the fallback gives the same answer.
- [ ] M9 only if the owner schedules a timing run.
- [ ] Rerun T1 to T6 locally on a clean checkout of the branch head:
      `pnpm exec vitest run core/topology --project unit`; record the command, the head commit, and
      the exit code.
- [ ] Write ADR-0200 in draft through the `humanizer` skill: the table with both columns, the
      defects of today's walk, the head commit, the rerun record, and the recommendation under the
      working rule of spec 5.3 point 5 (half-edges only if they beat the fallback on M4 or M5, or give
      an M8 link a consumer of this stage needs, at an M7 cost the owner accepts). Open the documents
      pull request `docs/half-edge-trial-result` with ADR-0200 and the ADR-0097 note. It merges only
      after the owner approves ADR-0200 or chooses the other design; the record then states his
      choice and the rule he used.

**Pins:** nothing on `main` changes. **Baselines:** none. **Schema:** none.

**Must not touch:** any file on `main` outside the documents pull request.

**Done when:** the documents pull request with ADR-0200 has merged, the owner's choice and rule are
recorded, each defect of today's walk has an issue (the owner's word for the filing), and the trial
branch is kept until pull request 9 merges.

**Size:** two to three lane-days, time box three (estimate). At the box, stop and report.

---

## Pull request 2: one tolerance module (#687)

Spec 5.1, points 1 to 8, the first step of 11, 12, and 13. Every geometric constant moves into one
module with its current value, and an architecture test keeps it there. No behavior changes.

**Files:**

- `core/geometry/tolerance.ts` (core, new) and `core/geometry/tolerance.test.ts`.
- Edits (core): `core/topology/wall-graph.ts`, `core/topology/junction-fill.ts`,
  `core/topology/rooms.ts`, `core/geometry/segment.ts`, `core/geometry/polygon.ts`,
  `core/scene/opening-reach.ts`, `core/scene/opening-void.ts`, `core/scene/walk-collision.ts`,
  `core/scene/front-direction.ts` (tell the lane for the view from the front (#627) before the pull request opens),
  `core/scene/wall-room-sides.ts`, `core/daylight/room-validation.ts`,
  `core/daylight/room-geometry.ts` (the daylight lane reviews), `core/geometry/wall-face.ts`,
  `core/index.ts` (the three kept names
  now export from the module: lines 396 and 545 today).
- Edits (engine): `engine/scene/wall-builder.ts`, `engine/scene/wall-prism.ts`.
- `tests/architecture/one-tolerance-module.test.ts` and `tests/architecture/other-distances.ts`
  (new).

**Interfaces** (`core/geometry/tolerance.ts`, exported from `core/index.ts`):

```ts
export const LENGTH_TOLERANCE_MM = 0.001
export const ANGLE_TOLERANCE_RAD = 1e-8
export const DERIVED_COORDINATE_GRID_MM = LENGTH_TOLERANCE_MM / 1000
export const SUPPORTED_EXTENT_MM = 1_000_000
export const SMALLEST_IMPERIAL_DISPLAY_STEP_MM = 25.4 / 256
export const SMALLEST_METRIC_DISPLAY_STEP_MM = 0.1
export const JOIN_DISTANCE_MM = 1
/** The graph merge distance; the derivation's length until pull request 13. */
export const DEFAULT_JUNCTION_TOLERANCE_MM = JOIN_DISTANCE_MM
export const DERIVATION_LENGTH_TOLERANCE_MM = DEFAULT_JUNCTION_TOLERANCE_MM
export const ROOM_RING_TOLERANCE_MM = DEFAULT_JUNCTION_TOLERANCE_MM
export const OUTLINE_TOLERANCE_MM = 1 // daylight outline distance, its own rule
// Today's values, one named entry each, with a one-line reason:
export const CROSS_PRODUCT_PARALLEL_LIMIT = 1e-9 // segment.ts, polygon.ts, opening-reach.ts
export const DEGENERATE_SQUARED_LENGTH_MM2 = 1e-9 // segment.ts, polygon.ts
export const MIN_FACE_AREA_MM2 = 1 // rooms.ts MIN_ROOM_AREA, junction-fill.ts AREA_EPSILON
export const FILL_CORNER_MATCH_MM = 1e-6 // junction-fill.ts CORNER_EPSILON
export const VOID_SAME_POINT_MM = 1e-9 // opening-void.ts
export const WALK_CONTACT_MM = 1e-6 // walk-collision.ts
export const FRONT_DIRECTION_TIE = 1e-9 // front-direction.ts, owned by the work on #627
export const WALL_BOUNDARY_MATCH_MM = 1e-6 // engine wall-builder.ts
export const CAP_AREA_LIMIT_MM2 = 1e-6 // engine wall-prism.ts
export const WALL_FACE_DEGENERATE_LENGTH_MM = 1e-9 // core/geometry/wall-face.ts
```

`core/geometry/polygon.ts` defines its snap as `1 / DERIVED_COORDINATE_GRID_MM` (the first use of the
length tolerance; the value stays 1e6 units per mm).

### Cycle 2.1: the derived values

- [ ] RED in `core/geometry/tolerance.test.ts`: Given the module, then `LENGTH_TOLERANCE_MM` is 0.001,
      `ANGLE_TOLERANCE_RAD` is 1e-8, `DERIVED_COORDINATE_GRID_MM` is 1e-6 within 1e-18,
      `SMALLEST_IMPERIAL_DISPLAY_STEP_MM / LENGTH_TOLERANCE_MM` is above 99,
      `SMALLEST_METRIC_DISPLAY_STEP_MM / LENGTH_TOLERANCE_MM` is 100, and
      `SUPPORTED_EXTENT_MM * Number.EPSILON * 10_000` is below `LENGTH_TOLERANCE_MM / 100` (the drift
      margin of spec 5.1 point 2), and 100,000 mm times `ANGLE_TOLERANCE_RAD` equals
      `LENGTH_TOLERANCE_MM` within 1e-15.
- [ ] GREEN: the module with the derived values; `polygon.ts` reads its grid from it.
- [ ] Commits: `test: expect the tolerance values derived from the display step and the number format`,
      `feat: define the length and angle tolerances in one module`.

### Cycle 2.2: no tolerance outside the module

- [ ] RED in `tests/architecture/one-tolerance-module.test.ts`: Given every production `.ts` and
      `.tsx` file under `core/`, `session/`, `engine/`, `bridge/`, `editor/`, and `app/` (not tests,
      stories, `*-test-support.ts`, `*-test-fixtures.ts`, `testing/`, or `core/format/generated/`),
      when the test scans for a `const` whose name matches `/(^|_)(EPS|EPSILON|TOLERANCE)(_|$)/`, for
      a comparison with a literal of the form `<n>e-<m>`, and for a numeric `const` below 1e-3 in
      `core/geometry/`, `core/topology/`, `core/scene/`, or `engine/scene/`, then every match is in
      `core/geometry/tolerance.ts` or is an entry of `OTHER_DISTANCES` at the file it names; and every
      entry of `OTHER_DISTANCES` is found at its file. `OTHER_DISTANCES` holds exactly:
      `DEFAULT_HIT_TOLERANCE_MM` (`editor/plan/hit-test.ts`), `SNAP_PIXEL_TOLERANCE`
      (`editor/plan/snap.ts`), `MARQUEE_DRAG_THRESHOLD_MM` (`editor/plan/select-gesture.ts`),
      `CLICK_TOLERANCE_PX` (`bridge/react/scene-selection.tsx`), `WALL_ATTACHMENT_TOLERANCE_MM`
      (`core/scene/wall-attached-furniture.ts`), `SLAB_SIDE_FACE_INSET_MM`
      (`engine/scene/room-builder.ts`), `MITER_LIMIT` (`core/topology/wall-footprint.ts`),
      `PITCH_LIMIT_EPSILON_RAD` (`core/scene/walk-camera.ts`), `ZENITH_ALIGNMENT_COSINE_EPSILON`
      (`core/environment/solar-position.ts`), `COLOR_ACCURACY_TOLERANCE` and
      `TONE_MAP_EXTREME_TOLERANCE` (`core/color/color-accuracy.ts`), each with the reason of spec 5.1
      point 8. On `main` the name pattern matches 23 declarations (8 of them on the list) and the
      value rule adds one (`DEGENERATE_LENGTH_MM`, `core/geometry/wall-face.ts:11`), so the test fails
      on 16 declarations: `PARALLEL_EPSILON` in three files, `DEGENERATE_SEGMENT_EPSILON`,
      `DEGENERATE_EDGE_EPSILON`, `DEFAULT_JUNCTION_TOLERANCE_MM`, `AREA_EPSILON`, `CORNER_EPSILON`,
      `SAME_POINT_EPSILON`, `CONTACT_EPSILON_MM`, `DIRECTION_TIE_TOLERANCE`, `BOUNDARY_EPSILON`,
      `CAP_AREA_EPSILON`, `ROOM_RING_TOLERANCE_MM`, `OUTLINE_TOLERANCE_MM`, and `DEGENERATE_LENGTH_MM`.
- [ ] GREEN: the 16 declarations move into the module under the names above
      (`DEGENERATE_LENGTH_MM` as `WALL_FACE_DEGENERATE_LENGTH_MM = 1e-9`); `MIN_ROOM_AREA`
      (`core/topology/rooms.ts:50`), which the test cannot see because its value is 1, becomes
      `MIN_FACE_AREA_MM2`; `SNAP_UNITS_PER_MM` (`core/geometry/polygon.ts:21`) is defined from
      `DERIVED_COORDINATE_GRID_MM` (cycle 2.1). The files import them; the values are unchanged.
- [ ] Commits: `test: expect one module to define every geometric tolerance`,
      `feat: move every geometric tolerance into the tolerance module`.

**Pins (must not change):** every existing test, unchanged, in particular `core/topology/wall-graph.test.ts`,
`core/daylight/room-validation.test.ts` and `core/daylight/span-at-tolerance.test.ts` (the outline
distance and the spans at it; the side probe at twice the distance has no test file of its own),
`core/scene/wall-room-sides.test.ts`, `core/topology/junction-fill.test.ts`,
`core/geometry/wall-face.test.ts`. No baseline moves.

**Must not touch:** the session layer fence; any command handler.

**Done when:** spec 5.1 "Done when" bullets 1, 2, 3, and 4 hold; ADR-0218 and ADR-0134 carry their
notes.

**Size:** 2 cycles.

---

## Pull request 3: property tests for the derivation (#687)

Spec 5.9, points 1 to 4. fast-check joins as a development dependency, with generators that make
plans and the properties that hold on `main` today. A property that fails on `main` is a defect:
stop and report it; do not weaken the property.

**Files:** `package.json`, `pnpm-lock.yaml` (the dependency, exact);
`core/topology/plan-arbitraries-test-support.ts` (new, generators);
`core/topology/derivation-properties.test.ts` (new).

**Interfaces** (`core/topology/plan-arbitraries-test-support.ts`, test support, not exported from
`core/index.ts`):

```ts
import type { Arbitrary } from 'fast-check'
export interface GeneratedPlan {
  readonly walls: readonly Wall[]
  readonly label: string
}
export type HardCase =
  | 'copy'
  | 'partial-overlap'
  | 'zero-length'
  | 'near-junction-inside'
  | 'near-junction-outside'
  | 'near-parallel'
export function planArbitrary(options?: {
  readonly maxWalls?: number // default 24
  readonly extentMm?: number // default 20_000, at most SUPPORTED_EXTENT_MM
  readonly hardCases?: readonly HardCase[] // default none
}): Arbitrary<GeneratedPlan>
export function closedLoopArbitrary(options?: {
  readonly maxCorners?: number
}): Arbitrary<GeneratedPlan>
export function splitWallAt(plan: GeneratedPlan, wallIndex: number, fraction: number): GeneratedPlan
export const PROPERTY_RUNS: number // 200 in the unit tier
```

### Cycle 3.1: the library and totality

- [ ] `build: add fast-check for property tests` (the dependency only).
- [ ] RED (characterization) in `derivation-properties.test.ts`: Given any plan from `planArbitrary`
      with every hard case, when `deriveRooms(plan.walls)` and `buildWallGraph(plan.walls)` run, then
      neither throws and every number in the result is finite. A failing seed prints.
- [ ] Commit: `test: expect the derivation to return for any generated plan`.

### Cycle 3.2: the graph

- [ ] Given any plan from `planArbitrary` without hard cases whose faces are all above
      `MIN_FACE_AREA_MM2`, when `buildWallGraph` gives V vertices, E edges, and C components, then
      `deriveRooms` returns E - V + C rooms, and every room polygon has at least three corners.
- [ ] Commit: `test: expect the room count to follow from the graph`.

### Cycle 3.3: invariance

- [ ] Given any closed loop, when its walls are reordered, moved by a vector within the extent, or
      turned about the origin by any angle, then the rooms have the same `wallIds` sets and areas within
      1e-6 of each other relative to the area.
- [ ] Commit: `test: expect rooms not to depend on wall order, position, or turn`.

### Cycle 3.4: splits, the merge distance, and corners

- [ ] Given any closed loop, when `splitWallAt` cuts any wall at a fraction in (0.05, 0.95), then the
      room areas and the outline corners (as point sets, within 1e-6 mm) are unchanged. Given two wall
      ends at a distance below `DERIVATION_LENGTH_TOLERANCE_MM / 2`, then `buildWallGraph` gives one
      vertex; at more than twice it, two. Given any junction of two walls, then the two
      `wallFootprints` corners at that junction are equal coordinates.
- [ ] Commit: `test: expect splits, the merge distance, and shared corners to hold`.

**Pins:** no production file changes. **Baselines:** none.

**Must not touch:** the session layer fence (it shares only `package.json` and the lockfile; the
second to merge rebases).

**Done when:** the four property groups pass in `pnpm test` and the description names the
fast-check version and its date.

**Size:** 4 cycles.

---

## Pull request 4: exact lengths that read back (#687)

Spec 5.8, points 1 to 6, with the owner's answers: the formatted length after a commit, and the
input steps now. A length typed in the new Length field of the wall inspector reads back as typed
after save and reload.

**Files:**

- core (units): `core/units/format-length.ts`, `core/units/format-adaptive-length.ts`,
  `core/units/exact-step.ts` (new), `core/units/index.ts`, `core/index.ts`.
- core (kernel): `core/geometry/typed-length.ts` (new).
- editor: `editor/plan/length-field.tsx` (shared with the command layer),
  `editor/plan/wall-length-editor.tsx` (new) and `wall-length-editor.stories.tsx` (new),
  `editor/shell/inspector.tsx` (shared), `editor/plan/snap.ts`, `editor/plan/use-snapping.ts`,
  `editor/plan/grid.ts`, `editor/plan/keyboard-candidate.ts`, `editor/plan/use-selection-keyboard.ts`,
  and the callers that must pass the unit system, found on `main` by their use of
  `DEFAULT_SNAP_GRID_MM`, `gridSpacingMm`, `visibleGridLines`, `CANDIDATE_STEP_MM`,
  `buildSnapContext`, `useSnapping`, `nudgeCandidate`, or the nudge steps:
  `editor/plan/draw-plan.ts`, `use-wall-editing.ts`, `use-plan-interaction.ts`,
  `authoring-tool-handlers.ts` (these four shared with the command layer), `plan-view.tsx` (shared),
  `use-selection-move.ts`, `ruler.ts`, `ruler-label-spacing.ts`, and any other file the type checker
  names when the signatures change.
- e2e: `e2e/tests/journeys/typed-wall-length.spec.ts` (new).
- tests: `tests/performance/baseline-plan-draw.json` if the grid changes the counts.

**Interfaces:**

```ts
// core/units/format-length.ts
export interface FormattedLength {
  readonly text: string // without the approximate mark
  readonly exact: boolean
}
/** Shows the coarsest step, from the precision down to the smallest display step, at which `mm` is exact within LENGTH_TOLERANCE_MM; otherwise rounds at the precision. */
export function formatLengthParts(mm: Millimeters, options: FormatLengthOptions): FormattedLength
export function formatLength(mm: Millimeters, options: FormatLengthOptions): string // marked text
// core/units/format-adaptive-length.ts
export function formatAdaptiveLengthParts(
  mm: Millimeters,
  preferences: UnitPreferences,
): FormattedLength
export function formatAdaptiveLength(mm: Millimeters, preferences: UnitPreferences): string // marked
export const APPROXIMATE_MARK = '≈ '
// core/units/exact-step.ts
/** The coarsest step at or finer than `precision`, down to the smallest display step, at which `value` (in the step's unit) is exact; undefined when none. */
export function exactPrecision(
  mm: Millimeters,
  options: FormatLengthOptions,
): DisplayPrecision | undefined
// core/geometry/typed-length.ts
/** The point at exactly `lengthMm` from `start` toward `toward`. Never joined to a nearby point. */
export function placeEndAtLength(start: Point, toward: Point, lengthMm: number): Point
// editor/plan/wall-length-editor.tsx
export interface WallLengthEditorProps {
  readonly floorId: string
  readonly wallId: string
  readonly start: Point
  readonly end: Point
  readonly openings: readonly { readonly position: number; readonly width: number }[]
  readonly preferences: UnitPreferences
  readonly dispatch: (command: Command) => void
}
export function WallLengthEditor(props: WallLengthEditorProps): ReactElement
// editor/plan/snap.ts
export function gridStepMm(units: UnitSystem): number // 101.6 imperial, 100 metric
// editor/plan/keyboard-candidate.ts
export function candidateStepMm(units: UnitSystem): number
// editor/plan/use-selection-keyboard.ts
export function nudgeStepsMm(units: UnitSystem): { readonly step: number; readonly large: number }
// editor/plan/grid.ts
export function gridSpacingMm(scale: number, units: UnitSystem): number
export function visibleGridLines(
  viewport: Viewport,
  size: ViewportSize,
  units: UnitSystem,
): VisibleGrid
// editor/plan/use-snapping.ts: SnappingInputs gains `units: UnitSystem`; buildSnapContext sets gridSpacingMm = gridStepMm(units)
```

### Cycle 4.1: the exact step, imperial

- [ ] RED in `core/units/format-length.test.ts`: Given 115.8875 mm (4 9/16") and feet-and-inches at
      1/8, then `formatLengthParts` gives `{ text: '4 9/16"', exact: true }`. Given 3762.771875 mm
      (12' 4 9/64"), it gives `{ text: '12\'4 9/64"', exact: true }`. Given 25.4 / 512 mm more than
      1219.2 mm (4' and 1/512"), then `exact` is false and the text is rounded at 1/8 (`4'`), and
      `formatLength` of that value is `≈ 4'`.
- [ ] GREEN: `exactPrecision` and `formatLengthParts`; `formatLength` marks.
- [ ] Commits: `test: expect a length to show its exact fraction below the precision`,
      `feat: show the coarsest exact step of a length and mark a rounded one`.

### Cycle 4.2: the exact step, metric and adaptive

- [ ] RED in `core/units/format-adaptive-length.test.ts`: with the default metric preferences, 3000.4
      mm gives `{ text: '3.0004 m', exact: true }`, 3000 mm gives `3.00 m` exact, 3000.45 mm gives
      `{ text: '3.00 m', exact: false }` and `formatAdaptiveLength` returns `≈ 3.00 m`; 150.3 mm gives
      `15.03 cm` exact; 7.1 mm gives `7.1 mm` exact. With the default imperial preferences, 1219.2 mm
      gives `4'` exact.
- [ ] GREEN: the adaptive forms search down to 0.1 mm.
- [ ] Commits: `test: expect metric lengths to show their exact decimal`,
      `feat: show exact metric lengths in every adaptive form`.

### Cycle 4.3: a length field shows the formatted length

- [ ] RED in `editor/plan/length-field.test.tsx` (and the RED retrofits every field test that reads
      the old bare decimal: thickness, ceiling height, opening, furniture): Given a `LengthField` with
      imperial preferences and `valueMm` 115.8875, then the input reads `4 9/16"`; when the user types
      `4 5/8` in inches and commits and the parent component passes the new value, then the input reads `4 5/8"`;
      a metric field with 2400 mm reads `2.40 m`. A unit switch still re-expresses without a commit.
- [ ] GREEN: `LengthField` formats through `formatAdaptiveLength`.
- [ ] Commits: `test: expect a length field to show the formatted length after a commit`,
      `feat: show the formatted length in every length field`.

### Cycle 4.4: a wall end at a typed length

- [ ] RED in `core/geometry/typed-length.test.ts`: `placeEndAtLength({x:0,y:0},{x:3,y:4},10)` is
      `{x:6,y:8}` exactly; for any start, direction, and length in (1, 100_000) mm, the distance from
      start to the result equals the length within 1e-9 relative; a zero direction throws.
- [ ] GREEN: the function.
- [ ] Commits: `test: expect a wall end placed at an exact typed length`,
      `feat: place a wall end at a typed length`.

### Cycle 4.5: the Length field

- [ ] RED in `editor/plan/wall-length-editor.test.tsx`: Given a wall (0,0) to (3000,0) with an
      opening at position 2500 and width 900, when the user commits `2000 mm`, then the field shows
      "The wall would end before an opening." and dispatches nothing; when `4000 mm`, then it
      dispatches `moveWallEndpoint(floorId, wallId, 'end', { x: 4000, y: 0 })` once; when `0`, then it
      shows "Enter a length greater than zero."
- [ ] GREEN: `WallLengthEditor` over `LengthField`, `placeEndAtLength`, and `moveWallEndpoint`.
- [ ] Commits: `test: expect a Length field that moves the wall end`,
      `feat: add a Length field for walls`.

### Cycle 4.6: the inspector shows it

- [ ] RED in `editor/shell/inspector.test.tsx`: Given a selected wall, the inspector shows the Length
      field beside the thickness field, labeled "Length", with the wall's formatted length.
- [ ] GREEN: `inspector.tsx` renders it, keyed like the thickness editor.
- [ ] Commits: `test: expect the wall inspector to show the Length field`,
      `feat: show the Length field in the wall inspector`.

### Cycle 4.7: input steps follow the unit system

- [ ] RED in `editor/plan/snap.test.ts`, `keyboard-candidate.test.ts`, `use-selection-keyboard.test.ts`,
      `grid.test.ts`, `use-snapping.test.ts`: `gridStepMm('imperial')` is 101.6 and `'metric'` 100;
      `candidateStepMm` the same; `nudgeStepsMm('imperial')` is `{ step: 101.6, large: 914.4 }` and
      metric `{ 100, 1000 }`; `buildSnapContext` with `units: 'imperial'` has `gridSpacingMm` 101.6;
      `gridSpacingMm(scale, 'imperial')` is always one of 25.4, 101.6, 304.8, 1219.2, 2438.4, 4876.8,
      9753.6, and every visible imperial grid line lies on a multiple of 25.4 mm.
- [ ] GREEN: the functions and their callers.
- [ ] Commits: `test: expect imperial projects to step in inches and feet`,
      `feat: make the grid and the keyboard steps follow the unit system`.

### Cycle 4.8: the angle snap rounds the length

- [ ] RED in `editor/plan/snap.test.ts`: Given an imperial snap context with origin (0,0) and grid
      snapping on, when `snapPoint` takes a cursor at 45 degrees and 1000.3 mm from the origin, then the
      result lies on the 45 degree ray at a distance that is the nearest multiple of 101.6 mm (1016),
      with kind `'angle'`; with `freeAngle` the result is the nearest grid point.
- [ ] GREEN: the angle snap rounds along its ray when the grid kind is enabled.
- [ ] Commits: `test: expect the angle snap to round the drawn length to the grid step`,
      `feat: round angle-snapped lengths to the grid step`.

### Cycle 4.9: the round trip (needs pull request 3; rebase onto it first)

- [ ] RED in `core/units/length-round-trip.test.ts` (fast-check): for every inch fraction down to 1/64
      in walls from 1" to 100', at angles that are multiples of 15 degrees and arbitrary ones, and for
      every metric value down to 0.1 mm from 1 mm to 30 m: parse the canonical text with `parseLength`,
      place the end with `placeEndAtLength`, dispatch `moveWallEndpoint` on a project, encode with
      `encodeDocument`, decode with `decodeDocument`, measure with `distance`, format with
      `formatAdaptiveLengthParts`: the result is `exact` and its text equals the canonical text
      (imperial) or parses back to the typed value within `LENGTH_TOLERANCE_MM` (metric).
- [ ] GREEN: whatever the property finds (expected: nothing; if it fails, the fix is in the
      formatter or the parser and the pull request says which).
- [ ] Commits: `test: expect every typed fraction and decimal to read back after a save`, and a `fix:`
      only if needed.

### Journey

- [ ] `test(e2e): type a wall length and read it back after a reload`
      (`e2e/tests/journeys/typed-wall-length.spec.ts`): a new imperial project, draw a wall along x
      with snapping on, the label shows no mark; type `12' 4 9/16"` in the Length field, reload, the
      field reads `12'4 9/16"`. Add it to `e2e/journey-coverage.json`.

**Pins:** `parseLength` accepts every text the formatter now writes (the round trip holds it);
`moveWallEndpoint` is unchanged; an end drag still moves one wall.

**Baselines that move, and why:** story baselines of the coordinate readout, the dimension
inspector, the overall dimensions, the wall inspector, and every length field story
(`e2e/stories/__screenshots__/`): the formatter and the field text; app screenshots of a new project
(`e2e/tests/visual-regression.spec.ts-snapshots/`): the imperial grid; the ruler stories and every
app screenshot that shows the ruler, because the ruler reads `gridSpacingMm`; the plan draw counts
(`tests/performance/baseline-plan-draw.json`) if the grid line count changes. New: the Length field
story.

**Must not touch:** the session layer fence; `editor/plan/snap-preferences*.ts` (session layer pull request 9); any
handler.

**Done when:** spec 5.8 "Done when" holds; ADR-0181's consequence names the Length field (ADR-0199
says so already).

**Size:** 9 cycles and one journey.

---

## Pull request 5: the wall path accessor (#687)

Spec 5.2, points 1 to 7. A wall path value and its functions land with the type-checked rule and
its exception list, and with one real reader.

**Files:** `core/geometry/wall-path.ts` (new) and `core/geometry/wall-path.test.ts`; `core/index.ts`;
`engine/scene/wall-scene-helpers.ts` (the first reader); `tests/architecture/wall-ends-through-the-path.test.ts`
and `tests/architecture/wall-end-read-exceptions.ts` (new).

**Interfaces** (`core/geometry/wall-path.ts`, exported from `core/index.ts`):

```ts
export interface LinePath {
  readonly kind: 'line'
  readonly start: Point
  readonly end: Point
}
export type WallPath = LinePath // pull request 15 adds ArcPath
export function linePath(start: Point, end: Point): LinePath
export function wallPath(wall: Pick<Wall, 'start' | 'end'>): WallPath
export function pathStart(path: WallPath): Point
export function pathEnd(path: WallPath): Point
export function pathLength(path: WallPath): number
export function pointAlong(path: WallPath, alongMm: number): Point
export function tangentAlong(path: WallPath, alongMm: number): Point // unit
export function normalAlong(path: WallPath, alongMm: number): Point // unit, left of start to end
export interface PathProjection {
  readonly point: Point
  readonly along: number // clamped to [0, pathLength]
  readonly offset: number // signed distance, positive on the normal's side
}
export function projectOntoPath(path: WallPath, point: Point): PathProjection
export function pathBounds(path: WallPath): { readonly min: Point; readonly max: Point }
export function subPath(path: WallPath, fromMm: number, toMm: number): WallPath
export function offsetPath(path: WallPath, offsetMm: number): WallPath
export function translatePath(path: WallPath, delta: Point): WallPath
export function rotatePath(path: WallPath, pivot: Point, radians: number): WallPath
export function reversePath(path: WallPath): WallPath
export function flattenPath(path: WallPath, maxDeviationMm: number): Point[]
```

### Cycle 5.1: the path and its measures

- [ ] RED: `wallPath` of (0,0) to (3000,4000) has kind `'line'`, length 5000, `pointAlong(2500)`
      (1500,2000), tangent (0.6,0.8), normal (-0.8,0.6); `pathStart` and `pathEnd` give the ends; the
      path is frozen.
- [ ] GREEN. Commits: `test: expect a wall path with its length, point, tangent, and normal`,
      `feat: describe a wall's centerline as a path`.

### Cycle 5.2: projection

- [ ] RED: on (0,0) to (1000,0), `projectOntoPath` of (400,250) is
      `{ point: (400,0), along: 400, offset: 250 }`, of (400,-250) has offset -250, of (1500,0) has along 1000 and point (1000,0).
- [ ] GREEN. Commits: `test: expect the nearest point on a wall path`, `feat: project a point onto a wall path`.

### Cycle 5.3: the other functions

- [ ] RED: bounds, `subPath(200, 700)` of a 1000 mm line is (200,0) to (700,0), `offsetPath(100)`
      moves it to y = 100, translate, rotate by pi/2 about the origin, `reversePath` swaps the ends,
      `flattenPath` of a line is its two ends.
- [ ] GREEN. Commits: `test: expect sub-paths, offsets, transforms, and flattening of a wall path`,
      `feat: cut, offset, transform, and flatten wall paths`.

### Cycle 5.4: the rule and its first reader

- [ ] RED: `wall-ends-through-the-path.test.ts` (decision 4 of this plan) with
      `WALL_END_READ_EXCEPTIONS` listing every flagged file except `engine/scene/wall-scene-helpers.ts`
      (at least 26 files: run the check, paste its list, and remove that one entry). It fails on that
      file. The same RED covers the structural gap: a value of type `Wall` or `WallSceneNode` passed
      to a parameter whose declared type has `start` or `end` (as
      `distanceAlongWall(wall: { start: Point; end: Point })`, `core/scene/wall-room-sides.ts:145`)
      counts as a read, and its file joins the list.
- [ ] GREEN: `buildFloorWallGraph` reads the ends through `wallPath`, `pathStart`, `pathEnd`.
- [ ] Commits: `test: expect wall ends to be read through the wall path`,
      `feat: build the floor wall graph from wall paths`.

**Pins:** every engine test of `buildFloorWallGraph`; no baseline moves.

**Must not touch:** the session layer fence.

**Done when:** the rule runs in `pnpm test` with its list; the list's length is in the description;
ADR-0034 has its note.

**Size:** 4 cycles.

---

## Pull request 6: `core/` reads walls through the path (#687)

Spec 5.2, point 6. Every `core/` file on the exception list moves to the path functions; behavior
does not change.

**Files** (core): the `core/` entries of `WALL_END_READ_EXCEPTIONS` as pull request 5 left them, at
least `core/export/svg/svg-plan-exporter.ts`, `core/export/svg/svg-view.ts`,
`core/scene/wall-attached-furniture.ts`, `core/scene/wall-room-sides.ts`, `core/scene/walk-collision.ts`,
`core/scene/scene-graph.ts`, `core/scene/exterior-walls.ts`, `core/commands/handlers/transform-commands.ts`
(shared with the command layer), `core/clipboard/clipboard.ts`; `tests/architecture/wall-end-read-exceptions.ts`.

### Cycle 6.1: the export

- [ ] RED: remove `core/export/svg/svg-plan-exporter.ts` and `svg-view.ts` from the list; the rule fails.
- [ ] `refactor: read wall ends through the path in the SVG export`.

### Cycle 6.2: the scene files

- [ ] RED: remove the five `core/scene/` entries; the rule fails.
- [ ] `refactor: read wall ends through the path in the scene derivations`.

### Cycle 6.3: commands and the clipboard

- [ ] RED: remove `transform-commands.ts`, `clipboard.ts`, and any remaining `core/` entry.
- [ ] `refactor: move and copy walls through the path`.

**Pins:** every test under `core/` unchanged; `core/export/svg/` output byte for byte on its fixtures.
No baseline moves.

**Must not touch:** the session layer fence. `svg-plan-exporter.ts` is shared with session
layer pull request 6: the second to merge rebases and keeps the other's change.

**Done when:** no `core/` file is on the list.

**Size:** 3 cycles.

---

## Pull request 7: the editor reads walls through the path (#687)

Spec 5.2, point 6, for `editor/`. Runs beside 6.

**Files** (editor): the `editor/` entries of the list, at least `draw-plan.ts`, `draw-surface-paint.ts`,
`fit.ts`, `overlay-label.ts`, `overlay-anchor.ts`, `snap.ts`, `hit-test.ts`, `hit-test-wall-face.ts`,
`marquee.ts`, `wall-editing.ts`, `use-wall-editing.ts`, `place-opening.ts`, `opening-drag.ts`,
`use-opening-resizing.ts` (all in `editor/plan/`), `editor/shell/zoom-control.tsx`;
`tests/architecture/wall-end-read-exceptions.ts`.

### Cycles 7.1 to 7.3

- [ ] 7.1 RED: remove the drawing files (`draw-plan.ts`, `draw-surface-paint.ts`, `fit.ts`,
      `zoom-control.tsx`, `overlay-label.ts`, `overlay-anchor.ts`). `refactor: draw walls through the path`.
- [ ] 7.2 RED: remove `snap.ts`, `hit-test.ts`, `hit-test-wall-face.ts`, `marquee.ts`.
      `refactor: hit-test and snap walls through the path`.
- [ ] 7.3 RED: remove the editing files and any remaining `editor/` entry.
      `refactor: edit walls and openings through the path`.

**Pins:** every editor test; the plan draw counts (`tests/performance/plan-draw-counts.test.ts`)
unchanged; no story or app baseline moves.

**Must not touch:** the session layer fence. `draw-plan.ts`, `use-wall-editing.ts`,
`place-opening.ts`, and `use-opening-resizing.ts` are shared with the command layer.

**Done when:** no `editor/` file is on the list.

**Size:** 3 cycles.

---

## Pull request 8: scene nodes carry the wall path (#687)

Spec 5.2, points 4 and 6. The wall scene node trades `start` and `end` for `path`, and the list
becomes empty.

**Files:** `core/scene/scene-graph.ts` (`WallSceneNode`), `engine/scene/wall-prism.ts`,
`engine/scene/wall-builder.ts`, `editor/shell/inspector.tsx` (the Length field reads the path),
every file that fails to compile (in `bridge/react/` only for that reason), the test
`app/harness-paint.test.ts` (it calls `roomFacingSide(wall.start, wall.end, room)` on harness wall
nodes at lines 89 and 108; the one `app/` edit of this pull request, told to the session lane before
it opens), and the 65 files that build wall node literals today (mostly tests; the RED retrofits
them to `path: linePath(a, b)`);
`tests/architecture/wall-end-read-exceptions.ts` (empty, then deleted with the list's import).

**Interface change:** `WallSceneNode` loses `start: Point` and `end: Point` and gains
`path: WallPath`.

### Cycle 8.1: the remaining readers

- [ ] RED: remove `engine/scene/wall-prism.ts` and any other entry; `refactor: build wall prisms from the path`.

### Cycle 8.2: the node carries the path

- [ ] RED: `core/scene/scene-graph.test.ts` expects `deriveWallNode` to return `path` equal to
      `wallPath(wall)` and no `start` or `end`; the same RED retrofits every literal.
- [ ] GREEN: the type and `deriveWallNode`. Commits: `test: expect a wall node to carry its path`,
      `feat: carry the wall path on the wall scene node`.

### Cycle 8.3: the list is gone

- [ ] RED: the rule asserts an empty set with no exception list. `refactor:` removes the list file.

**Pins:** every scene and story baseline unchanged; the scene rebuild counts unchanged.

**Must not touch:** the session layer fence.

**Done when:** spec 5.2 "Done when" holds.

**Size:** 3 cycles.

---

## Pull request 9: one plan geometry per floor (#674, #687)

Spec 5.3, points 1 to 5 and 9, and 5.4, in the form ADR-0200 chose. The plan geometry is derived
once per floor through one network memo, carried by the scene graph, and read by room nodes; room
derivation uses the drawn thickness.

**Files:**

- core (kernel): `core/topology/floor-plan-geometry.ts` (new), `core/topology/wall-network-memo.ts`
  (new), `core/topology/junction-fans.ts` (new), `core/topology/wall-footprint.ts` and
  `junction-fill.ts` (take the fans), `core/topology/rooms.ts` (rooms from the network;
  `deriveRooms(walls)` stays as a wrapper over it), and, only if ADR-0200 adopts half-edges,
  `core/topology/half-edges.ts` (new).
- core (scene): `core/scene/scene-graph.ts` (`SceneGraph.planGeometry`), `scene-graph-assembly.ts`,
  `scene-graph-deriver.ts` (shared with the command layer), `scene-graph-empty.ts`,
  `scene-graph-for-floor.ts`, `scene-graph-parity-fixtures.ts`; `core/index.ts`.
- tests: `core/topology/floor-plan-geometry.test.ts`, `core/topology/legacy-room-walk-test-support.ts`
  (new: a frozen copy of today's `deriveRooms` and its private helpers, made in the RED of 9.3 before
  `rooms.ts` changes), `core/topology/plan-geometry-parity.test.ts` (new; both removed in 12.1),
  `core/topology/wall-network-memo.test.ts`, `core/scene/plan-geometry-builds.test.ts` (new),
  `core/scene/scene-graph-deriver-parity.test.ts`.

**Interfaces** (`core/topology/floor-plan-geometry.ts`, exported from `core/index.ts`):

```ts
export interface PlanGeometryRegistries {
  readonly constructionProfiles: Registry<ConstructionProfile>
}
export interface NetworkWall {
  readonly id: string
  readonly path: WallPath
  readonly thickness: number
  readonly constructionProfile?: string
}
export interface NetworkEdge {
  readonly index: number
  readonly from: number // junction index
  readonly to: number
  readonly wallId: string // the owner
  readonly covers: readonly string[] // empty until pull request 12
  readonly path: WallPath // the owner's stretch from `from` to `to`
}
export type WallSide = 'positive' | 'negative'
export interface WallFaceRecord {
  readonly wallId: string
  readonly side: WallSide
  readonly stretches: readonly {
    readonly fromMm: number
    readonly toMm: number
    readonly roomIndex: number | undefined
  }[]
}
export interface WallNetwork {
  readonly walls: readonly NetworkWall[]
  readonly thickness: ReadonlyMap<string, number> // resolved
  readonly junctions: readonly Point[]
  readonly edges: readonly NetworkEdge[]
  /** Junction to its edge indexes, sorted counterclockwise by leaving direction. */
  readonly fans: ReadonlyMap<number, readonly number[]>
  readonly footprints: readonly WallFootprint[] // by edge index
  readonly fills: readonly JunctionFill[]
  readonly faces: readonly WallFaceRecord[]
}
export interface OpeningSpan {
  readonly openingId: string
  readonly edgeIndex: number
  readonly fromMm: number // along the edge's path
  readonly toMm: number
}
export interface PlanRoom extends Room {
  readonly faces: readonly { readonly wallId: string; readonly side: WallSide }[]
}
export interface SetAside {
  readonly zeroLengthWallIds: readonly string[]
  readonly coveredWallIds: readonly string[]
  readonly unboundRecordIds: readonly string[]
}
export interface FloorPlanGeometry {
  readonly floorId: string
  readonly network: WallNetwork
  readonly openingSpans: readonly OpeningSpan[]
  readonly rooms: readonly PlanRoom[]
  readonly setAside: SetAside
}
export function deriveWallNetwork(
  walls: readonly NetworkWall[],
  registries?: PlanGeometryRegistries,
): WallNetwork
export function deriveOpeningSpans(
  network: WallNetwork,
  openings: readonly Opening[],
): OpeningSpan[]
export function derivePlanRooms(network: WallNetwork): PlanRoom[]
export function deriveFloorPlanGeometry(
  floor: Floor,
  registries?: PlanGeometryRegistries,
): FloorPlanGeometry
export type PlanGeometryDeriver = (
  floor: Floor,
  registries?: PlanGeometryRegistries,
) => FloorPlanGeometry
export function createPlanGeometryDeriver(): PlanGeometryDeriver
// core/topology/wall-network-memo.ts (decision 5a; exported from core/index.ts)
/** The network of this wall list under these registries, built once and then reused while both objects live. */
export function wallNetworkFor(
  walls: readonly Wall[],
  registries?: PlanGeometryRegistries,
): WallNetwork
/** Networks built since the module loaded; tests read it before and after. */
export function wallNetworkBuildCount(): number
/** Fan computations since the module loaded. */
export function junctionFanBuildCount(): number
// core/topology/legacy-room-walk-test-support.ts (test support, removed in 12.1)
export function legacyDeriveRooms(walls: readonly Wall[]): Room[] // a frozen copy of today's walk
// core/scene/scene-graph.ts: SceneGraph gains `planGeometry?: FloorPlanGeometry[]` (optional for
// hand-built literals, always set by both entry points, like gradeElevation).
// core/scene/scene-graph-assembly.ts: SceneNodeDerivations gains
//   readonly planGeometry: (floor: Floor) => FloorPlanGeometry
// and roomNodes becomes (floor, geometry: FloorPlanGeometry, overrides) => RoomSceneNode[].
```

The inner form comes first (9.2), so the rooms of 9.3 are built on it and not rewritten.

### Cycle 9.1: paths and resolved thickness

- [ ] RED: Given a floor with a wall of profile `solid-masonry-brick`, `deriveFloorPlanGeometry`
      gives that wall `thickness` equal to `effectiveWallThickness` of the wall and a path equal to
      `wallPath(wall)`; a wall with an unknown profile keeps its raw thickness.
- [ ] GREEN. Commits: `test: expect the plan geometry to resolve each wall's path and thickness`,
      `feat: derive a wall network with resolved thickness`.

### Cycle 9.2: the inner form of ADR-0200

- [ ] If the fallback (1 cycle): RED that `deriveWallNetwork` keeps today's graph and that holes come
      out of `derivePlanRooms` with one containment pass inside the build; GREEN.
- [ ] If half-edges (4 cycles, 9.2a to 9.2d): (a) RED for twin, next, and face, as in trial step T1, on
      the network; (b) inner cycles as holes, one point-in-face test per free-standing component;
      (c) components, as in trial step T5, both cases; (d) every returned record frozen. GREEN each in
      `half-edges.ts`, read from the trial branch, which still exists.
- [ ] Commits: `test: expect <the chosen form> in the plan geometry`, `feat: <the chosen form>`.

### Cycle 9.3: the same rooms as today, for walls without a profile

- [ ] RED in `plan-geometry-parity.test.ts`, with `legacy-room-walk-test-support.ts` added in the same
      commit: on every room fixture, the project fixtures, the reference project, and `planArbitrary`
      plans without hard cases, the rooms of `deriveFloorPlanGeometry` equal `legacyDeriveRooms`.
- [ ] GREEN: `derivePlanRooms` on the network; `deriveRooms(walls)` becomes a wrapper over it.
      Commits: `test: expect the plan geometry rooms to match today's walk`,
      `feat: derive rooms from the wall network`.

### Cycle 9.4: the drawn faces bound a room (#674)

- [ ] RED: Given a 5000 mm square of `solid-masonry-brick` walls on the centerline, the room's area
      is (5000 - t)² for the profile's total thickness t, and its clear outline lies on the drawn faces.
- [ ] GREEN. Commits: `test: expect a room of profile walls to measure between the drawn faces`,
      `fix: bound rooms by the resolved wall thickness`.

### Cycle 9.5: one fan per junction

- [ ] RED: Given a tee, `network.fans` lists three edges counterclockwise; `network.footprints` and
      `network.fills` equal `wallFootprints` and `junctionFills` of the same graph; on the reference
      project, `junctionFanBuildCount()` rises by one per floor network built.
- [ ] GREEN: `junction-fans.ts`; footprints and fills take the fans. Commits:
      `test: expect the fans of a floor to be computed once`, `feat: share one fan per junction`.

### Cycle 9.6: the faces of each wall

- [ ] RED: Given two rooms sharing a wall, that wall's `positive` face has one stretch bounding one
      room and its `negative` face the other; an outside wall has one face whose stretches bound no
      room; on the fixtures of `core/scene/wall-room-sides.test.ts`, the sides agree with
      `wallStretches` for every wall.
- [ ] GREEN. Commits: `test: expect each wall face to know the rooms along it`,
      `feat: record the rooms along each wall face`.

### Cycle 9.7: one network memo

- [ ] RED in `wall-network-memo.test.ts`: `wallNetworkFor` of the same wall list and registries twice
      returns the same object and raises `wallNetworkBuildCount()` by one; a new wall list, or new
      registries, builds again; the network equals `deriveWallNetwork` of the same walls. That the memo
      holds its keys weakly is not testable in the unit tier: the reviewer checks that both maps are
      `WeakMap`s and says so.
- [ ] GREEN. Commits: `test: expect one wall network per wall list`, `feat: build each wall network once`.

### Cycle 9.8: three parts, read through the memo

- [ ] RED in `plan-geometry-builds.test.ts`: with `createPlanGeometryDeriver()`, the same floor object
      twice returns the same object; a floor whose openings changed returns a geometry whose `network`
      is the same object and whose `openingSpans` is new; an edit of one wall on floor A of a two-floor
      project raises `wallNetworkBuildCount()` by exactly one, and `deriveSceneGraph` of the edited
      project after the deriver raises it by zero.
- [ ] GREEN. Commits: `test: expect the plan geometry to rebuild only the part that changed`,
      `feat: memoize the plan geometry by its parts`.

### Cycle 9.9: on the scene graph

- [ ] RED: `deriveSceneGraph(project).planGeometry` has one entry per floor in floor order; each room
      node's area equals its plan geometry room's area; the parity test compares the field cold and on a
      warm cache after every kind of edit, a construction profile edit among them.
- [ ] GREEN: `assembleSceneGraph` lists the field; the room member reads it. Commits:
      `test: expect the scene graph to carry one plan geometry per floor`,
      `feat: carry the plan geometry on the scene graph`.

**Pins:** the deriver's memoization tests unchanged; `scene-graph-deriver-floor-id.test.ts` and
`-wall-height.test.ts` unchanged; room fixtures without profiles unchanged.

**Baselines that move:** any scene or story with a profile wall (expected none: no profile wall was
found in the e2e or story fixtures; check); `tests/performance/baseline-scene-rebuild.json` only if a
count changes, with the reason.

**Must not touch:** the session layer fence; `session/editor-session/editor-session.ts` (signatures
of both entry points stay; the memo needs no edit there).

**Done when:** spec 5.3 "Done when" bullets 1 (with pull request 1), 4, and "Room nodes ... receive
the same plan geometry" for room nodes hold; the build count of 9.8 holds; ADR-0018 and ADR-0137
carry their notes.

**Size:** 9 cycles with the fallback, 12 with half-edges.

---

## Pull request 10: the plan and the export read the plan geometry (#546)

Spec 5.3, point 2, for the plan and the SVG export. Nothing in `editor/` or `core/export/` builds a
graph or a footprint after this.

**Files:** `editor/plan/draw-plan.ts` (shared), `editor/plan/opening-spans.ts`,
`editor/plan/draw-surface-paint.ts`, `editor/plan/hit-test.ts`, `hit-test-wall-face.ts`,
`editor/plan/snap.ts`, `use-snapping.ts` (junctions and paths from the plan geometry),
`core/export/svg/svg-plan-exporter.ts` (shared with session layer pull request 6), `tests/performance/plan-redraw-builds.test.ts`
(new). `DrawPlanOptions` gains `planGeometry: FloorPlanGeometry`.

### Cycles

- [ ] 10.1 RED: Given `drawPlan` with a plan geometry whose footprint for one edge differs from what
      its walls would give, the recorded fill path follows the plan geometry.
      `feat: draw wall footprints and fills from the plan geometry`.
- [ ] 10.2 RED: openings in the plan are drawn from `planGeometry.openingSpans` (a doctored span moves
      the drawn break). `feat: draw opening breaks from the plan geometry spans`.
- [ ] 10.3 RED: hit testing a wall and a wall face uses the network's footprints and paths (a doctored
      footprint changes the hit). `feat: hit-test walls on the plan geometry`.
- [ ] 10.4 RED: endpoint and edge snapping read `network.junctions` and the wall paths.
      `feat: snap to the plan geometry`.
- [ ] 10.5 RED: the SVG of a room of profile walls shows the room area of the plan geometry and walls
      at the resolved thickness. `feat: export the plan from the plan geometry`.
- [ ] 10.6 RED in `plan-redraw-builds.test.ts`: a redraw of the same scene graph at another viewport
      and with another view state raises `wallNetworkBuildCount()` by zero.
      `feat: draw the plan without building a wall graph`.

**Pins:** `tests/performance/plan-draw-counts.test.ts` counts unchanged (if one changes, update with
the reason); every plan story baseline unchanged.

**Must not touch:** the session layer fence; the 3D files of pull request 11.

**Done when:** #546's condition (spec 5.3 "Done when", bullet 2) holds for the plan; the SVG export
reads the plan geometry.

**Size:** 6 cycles.

---

## Pull request 11: the 3D walls read the plan geometry (#687, the tee issue)

Spec 5.3, points 6 to 8. The pure wall math moves from `engine/` to `core/`, the 3D builders read the
plan geometry, and an opening across a tee is cut per edge (a fix with its own issue).

**Files:** core: `core/topology/wall-edge-frame.ts` (new: the edge frame, the miter remap, the reveal
classification from `engine/scene/wall-builder.ts`), `core/topology/opening-edge.ts` (spans replace
the center-edge rule), `core/scene/junction-fade.ts`, `core/scene/wall-room-sides.ts`,
`core/scene/exterior-walls.ts`, `core/scene/opening-room-side.ts`, `core/scene/walk-collision.ts`;
engine: `engine/scene/wall-builder.ts`, `wall-scene-helpers.ts` (`buildFloorWallGraph` goes),
`build-scene.ts`, `floor-subgroups.ts`, `near-wall-transparency-enrollment.ts`,
`junction-fill-builder.ts`; tests: the moved engine tests of the wall math (moved in the RED),
`tests/architecture/one-wall-graph-builder.test.ts` (new).

### Cycles

- [ ] 11.1 RED: the tests of the edge frame, the miter remap, and the reveal classification move to
      `core/topology/wall-edge-frame.test.ts` and import from there. GREEN moves the code.
      `feat: move the pure wall math into the kernel`.
- [ ] 11.2 RED: the wall builder builds its meshes from `planGeometry` footprints and fills (a doctored
      footprint moves a mesh vertex). `feat: build 3D walls from the plan geometry`.
- [ ] 11.3 RED: an opening across a tee gives one void per edge it crosses, with spans equal to the
      plan's (the scene fixture of the tee case). `fix: cut an opening across a tee on each edge`
      (name the new issue in the commit body).
- [ ] 11.4 RED: `junctionFadeGroups` and the near-wall enrollment read the fans of the plan geometry
      and build no graph (`wallNetworkBuildCount()` and `junctionFanBuildCount()` do not rise). `feat: fade junctions from the plan geometry fans`.
- [ ] 11.5 RED: `wallStretches` and `roomSidesAt` give the same answer from the network's faces on
      every fixture of their tests and of the exterior wall tests.
      `feat: read the rooms along a wall from its faces`.
- [ ] 11.6 RED: walk collision reads the footprints of the plan geometry.
      `feat: collide with the plan geometry footprints`.
- [ ] 11.7 RED in `one-wall-graph-builder.test.ts`: `buildWallGraph(` and `vertexIncidence(` are
      called in production only from `core/topology/`. `refactor:` removes the last caller.

**Pins:** every scene baseline except the tee case; `tests/performance/baseline-scene-rebuild.json`
unless a count changes (then the reason); walk-mode tests.

**Baselines that move:** a scene baseline with an opening across a tee, if any reference scene has
one (before and after images in the description); pixel steps from the move of the wall math (each
one explained or fixed).

**Must not touch:** the session layer fence; the plan files of pull request 10.

**Done when:** spec 5.3 "Done when" bullets 2, 3, 5, and 6 hold; ADR-0080, ADR-0082, and ADR-0218
carry their notes.

**Size:** 7 cycles.

---

## Pull request 12: overlapping walls keep their rooms (#681)

Spec 5.5. The derivation makes one edge per shared stretch, owned by the first wall in the list, and
drawing over a wall adds only the part that no wall covers.

**Files:** core: `core/geometry/tolerance.ts` (predicates), `core/topology/wall-graph.ts` (collinear
noding), `core/topology/floor-plan-geometry.ts` (`covers`, `coveredWallIds`),
`core/topology/uncovered-parts.ts` (new), `core/commands/handlers/wall-commands.ts` (shared),
`core/index.ts`; editor: `editor/plan/draw-plan.ts` (the preview shows the parts),
`editor/plan/use-plan-interaction.ts` and `authoring-tool-handlers.ts` (shared: the line);
tests: `core/topology/plan-geometry-parity.test.ts` and `legacy-room-walk-test-support.ts` (both deleted in 12.1's RED),
`core/topology/overlap.test.ts` (new), `derivation-properties.test.ts`;
e2e: `e2e/tests/journeys/draw-over-a-wall.spec.ts` (new).

**Interfaces:**

```ts
// core/geometry/tolerance.ts
/** Every point of the shorter segment lies within DERIVATION_LENGTH_TOLERANCE_MM of the other's line. */
export function onOneLine(a1: Point, a2: Point, b1: Point, b2: Point): boolean
export function pointsCoincide(a: Point, b: Point): boolean // within DERIVATION_LENGTH_TOLERANCE_MM
// core/topology/uncovered-parts.ts
export interface WallPart {
  readonly start: Point
  readonly end: Point
}
export function uncoveredParts(existing: readonly Wall[], drawn: WallPart): WallPart[]
export function drawnWallNote(existing: readonly Wall[], drawn: WallPart): string | undefined
```

### Cycles

- [ ] 12.1 RED in `overlap.test.ts` (the same RED deletes `plan-geometry-parity.test.ts` and `legacy-room-walk-test-support.ts`, whose old
      walk keeps #681's fault): Given a 4000 mm square and (a) a wall inside one edge, (b) a wall over
      one edge and past its corner, (c) an exact copy of one edge, then each gives one room of the
      square's area. `fix: keep the room when a wall lies along its edge`.
- [ ] 12.2 RED: the shared stretch is one edge owned by the earlier wall, with the later wall in
      `covers`; a wall covered over its whole length is in `setAside.coveredWallIds` and draws nothing;
      the footprint of the stretch is the owner's. `feat: give each shared stretch one owner`.
- [ ] 12.3 RED (fast-check): adding a wall along any stretch of any wall of a closed loop changes no
      room and no area. `test:` passes after 12.2 (characterization of the new rule); add the
      `'partial-overlap'` and `'copy'` hard cases to the totality property.
- [ ] 12.4 RED: `uncoveredParts` of wall (0,0)-(4000,0) and drawn (1000,0)-(5000,0) is
      [(4000,0)-(5000,0)]; drawn (-1000,0)-(5000,0) gives two parts; drawn inside gives []; a drawn
      wall off the line is returned whole; `drawnWallNote` gives the two texts of decision 8.
      `feat: find the part of a drawn wall that no wall covers`.
- [ ] 12.5 RED in `wall-commands.test.ts`: `addWall` over part of a wall adds only the uncovered
      part(s); the existing wall object is deep-equal before and after; undo restores the floor; redo
      gives the same ids (the second part's id derives from the first); a wall drawn inside adds
      nothing. `feat: add only the uncovered part of a drawn wall`.
- [ ] 12.6 RED: the wall tool's preview draws only the parts (`draw-plan` recording), and the
      announcement carries the note. `feat: preview and announce the part of a wall that is added`.
- [ ] Journey: `test(e2e): draw over part of a wall and keep the room`.

**Pins:** rooms of every fixture without overlaps unchanged; every scene baseline.

**Must not touch:** the session layer fence; other handlers (a move, a paste, an end drag stay as
they are).

**Done when:** spec 5.5 "Done when" holds; ADR-0026 has its note; the issue for other commands that
leave overlaps is filed (the owner's word).

**Size:** 6 cycles and one journey.

---

## Pull request 13: exact junctions under the length tolerance (#687)

Spec 5.1, points 9 to 11 and 13. Pointer input joins within 1 mm, a migration makes the ends the old
rule joined one point (schema version 18 if still free), and the derivation switches to 0.001 mm.

**Files:** core: `core/geometry/tolerance.ts` (`DERIVATION_LENGTH_TOLERANCE_MM` becomes
`LENGTH_TOLERANCE_MM`; `ROOM_RING_TOLERANCE_MM` too; the length-based parallel test; the degenerate
face rule), `core/geometry/segment.ts`, `polygon.ts`, `core/topology/wall-graph.ts`, `rooms.ts`,
`junction-fill.ts`, `core/topology/join.ts` (new), `core/migrations/schema/legacy-wall-graph.ts` and
`core/migrations/schema/legacy-segment.ts` (new: frozen copies, as of `8d922cf2`, of `wall-graph.ts`
and of the two helpers it calls, `segmentIntersection` and `pointOnSegment`; their numbers are the
frozen entries `LEGACY_JUNCTION_MERGE_MM` and `LEGACY_PARALLEL_CROSS_LIMIT` of the tolerance module,
plan decision 1), `core/migrations/schema/exact-junctions.ts` (new),
`core/migrations/schema/index.ts`, `core/model/factories.ts` (version + 1, revision 0, the comment
line), `core/index.ts`; generated: `schema/18/vernacular.schema.json`, `core/model/known-keys.json`,
`core/format/generated/*` (by `pnpm schema:generate`); fixtures:
`tests/fixtures/projects/versions/v18.vernacular.json` and the reader's version list; editor:
`editor/plan/use-wall-editing.ts` (shared) and `use-plan-interaction.ts` (shared) call the join;
tests: `core/migrations/schema/exact-junctions.test.ts`, `tests/format/exact-junctions-report.test.ts`,
`tests/format/schema-drift.test.ts` (the reminder case `is revision 1 while the version is 17`
changes in the RED of 13.6), `editor/plan/wall-editing.test.ts` (13.8; there is no test file for
`use-wall-editing.ts`, so 13.8's RED creates `editor/plan/use-wall-editing.test.tsx` if the drag
cannot be tested through `wall-editing.ts`).

**Interfaces:**

```ts
// core/geometry/tolerance.ts
export function areParallel(a1: Point, a2: Point, b1: Point, b2: Point): boolean // length test, spec 5.1 point 3
export function isDegenerateFace(area: number, perimeter: number): boolean // area <= LENGTH_TOLERANCE_MM * perimeter
// core/topology/join.ts
/** A pointer point within JOIN_DISTANCE_MM of a junction becomes that junction, else within it of a wall path becomes the nearest point on it, else it is returned unchanged. */
export function joinPointerPoint(point: Point, network: WallNetwork): Point
// core/migrations/schema/exact-junctions.ts
export interface ExactJunctionReport {
  readonly endsMoved: number
  readonly largestMoveMm: number
  readonly wallsSetToNoLength: number
  readonly teesOnSecondRule: number
  readonly nearCrossingClusters: number
  readonly floorsAtPassLimit: readonly string[]
  readonly openingsClamped: number
  readonly lengthLabelsChanged: number // walls whose formatted length at the default precision changes
}
export function exactJunctions(project: ProjectShape): {
  readonly project: ProjectShape
  readonly report: ExactJunctionReport
}
export const exactJunctionsMigration: SchemaMigration // from: 17 (or the version current at merge)
```

### Cycles

- [ ] 13.1 RED: `legacyWallGraph` equals today's `buildWallGraph` at 1 mm on every fixture (written
      while they are equal), and the architecture test of pull request 2 passes with the two frozen
      entries in the module. GREEN: the two copies and the two entries.
      `feat: keep a frozen copy of the old wall graph for the migration`.
- [ ] 13.2 RED: a wall 0.5 mm long gets its end set to its start, keeps its id, openings, and paint,
      and counts in `wallsSetToNoLength` (step 1). `feat: set walls of 1 mm or less to no length`.
- [ ] 13.3 RED: `keeps the rooms of a corner whose ends were 0.4 mm apart`: after `exactJunctions`
      the ends are one point, the rooms under the new rule equal the rooms under the old graph with
      the overlap rule of pull request 12, and no end moved more than 1 mm (step 2). A fixture whose
      rooms differ only because pull request 12 already fixed #681 is named, not counted. `feat: write each joined end onto its junction`.
- [ ] 13.4 RED: a chain of two tees ends on the met walls' lines within 1e-6 mm and moves no end more
      than 3 mm; a vertex within 1 mm of two crossing walls goes to their crossing; a cycle that does
      not settle stops at 8 passes and names the floor (steps 3 to 5).
      `feat: settle tees onto the walls they meet`.
- [ ] 13.5 RED: three walls crossing within 1 mm are counted and left; an opening keeps its plan
      center and is clamped and counted when it would pass an end; a dimension point on a moved end
      moves with it (steps 6 and 7). `feat: carry openings and dimensions with the moved ends`.
- [ ] 13.6 RED: `exactJunctionsMigration` is registered at the current version; v18 fixture and
      schema 18 exist; the reminder case of `schema-drift.test.ts` names the new version and revision 0;
      every version fixture migrates and passes the schema; the report test runs
      `exactJunctions` over every format and version fixture, asserts the bounds of spec 5.1 point 10,
      and prints the counts, `lengthLabelsChanged` among them (copy them into the description).
      `feat: migrate old junctions to exact points` (with `build:` for the generated files).
- [ ] 13.7 RED: two typed ends 0.5 mm apart are two junctions and leave the room open; ends 0.0005 mm
      apart are one; `areParallel` gives the same answer for a 1 m and a 100 m wall at the same angle;
      a face of mean width below 0.001 mm is degenerate; the merge-distance property of 3.4 now runs at
      0.001 mm. `feat: compare derived geometry with the length tolerance`.
- [ ] 13.8 RED: a pointer drag released 0.5 mm from a junction stores the end at the junction exactly
      (in `wall-editing.test.ts`, or a new `use-wall-editing.test.tsx`); a length typed in the Length
      field that ends 0.5 mm from a junction is
      stored as typed. `feat: join pointer-placed ends within 1 mm`.
- [ ] 13.9 RED (fast-check): a generated version 17 document keeps its rooms and every user field
      through the migration. `test:` (characterization) or `fix:` if it finds a case.

**Pins:** rooms of every fixture (the report shows none changed); the daylight outline distance stays
1 mm; walk collision and opening voids keep their entries; the near-wall fade's tests
(`engine/scene/near-wall-transparency-run-owner.test.ts`, `near-wall-transparency-runs.test.ts`, and `near-wall-transparency.test.ts`) pass
across the switch of `ROOM_RING_TOLERANCE_MM` from 1 mm to 0.001 mm, which narrows the fade's window
(`engine/scene/near-wall-run-owner.ts:59-60`). If one fails, stop and report: the fade then needs its
own named distance, decided with the lane that owns it.

**Baselines that move:** fixtures whose ends move (named in the report); scene baselines only if a
reference fixture's ends move (expected none: not measured).

**Schema step:** the next free `schemaVersion` (18 if nothing landed); `CURRENT_SCHEMA_REVISION` to 0;
a fixture; `pnpm schema:generate`. Check the number again before the merge.

**Must not touch:** the session layer fence; `core/migrations/migrate.ts`.

**Done when:** spec 5.1 "Done when" holds in full; ADR-0026 has its note.

**Size:** 9 cycles.

---

## Pull request 14: room records with a stable identity (#687)

Spec 5.6. A room's user data becomes a stored record that binds to its room by wall faces and then a
point, and a step after every wall change keeps the records current (schema version 19 if still
free).

**Files:** core: `core/model/types.ts` (`RoomRecord`, `RoomFaceRef`, `Project.roomRecords`, removal of
`roomOverrides`), `core/model/factories.ts`, `core/topology/room-records.ts` (new),
`core/topology/floor-plan-geometry.ts` (records in the rooms part, ids), `core/topology/rooms.ts`,
`core/commands/room-record-binding.ts` (new, the wrapper; plan decision 11),
`core/commands/handlers/room-commands.ts` and `register-all-project-commands.ts` (shared),
`core/commands/testing/project-command-samples.ts` and `extensions-fixture.ts` (shared),
`core/architecture-era/resolve-period.ts`, `resolve-style.ts`, `core/scene/scene-graph.ts`,
`scene-graph-assembly.ts`, `scene-graph-deriver.ts` (shared), `scene-graph-parity-fixtures.ts`,
`core/export/svg/svg-plan-exporter-test-fixtures.ts`, `core/migrations/schema/room-records.ts` (new),
`rekey-room-overrides.ts` (its own copy of the key), `core/migrations/schema/index.ts`,
`core/index.ts`; generated: `schema/19/`, `known-keys.json`, `core/format/generated/*`;
`tests/format/schema-drift.test.ts` (the reminder case, in the RED of 14.8); fixtures:
`tests/fixtures/projects/versions/v19.vernacular.json`; `tests/format/room-overrides-binding.test.ts`
(moves to records in the RED); editor: `editor/shell/inspector.tsx`, `inspector-test-support.tsx`, the
six `editor/plan/room-*-editor.tsx` (shared).

**Interfaces:**

```ts
// core/model/types.ts
export interface RoomFaceRef {
  readonly wallId: string
  readonly side?: WallSide // absent matches either side (migrated records)
}
export interface RoomRecord extends RoomOverride {
  readonly id: string
  readonly floorId?: string
  readonly boundary: readonly RoomFaceRef[]
  readonly anchor?: Point
}
// Project: roomRecords?: RoomRecord[] replaces roomOverrides
// core/topology/room-records.ts
export interface RoomBinding {
  readonly recordByRoom: ReadonlyMap<number, string> // room index to record id
  readonly unbound: readonly string[]
}
export function bindRoomRecords(
  rooms: readonly PlanRoom[],
  records: readonly RoomRecord[],
): RoomBinding
export function roomAnchor(room: PlanRoom): Point // inside the clear outline, same for same input
export function roomIdFromFaces(
  faces: readonly { readonly wallId: string; readonly side: WallSide }[],
): string
/** Rewrites the faces and, when it left the room, the anchor of each bound record of these floors. Reads networks through wallNetworkFor. */
export function rebindRoomRecords(project: Project, floorIds: readonly string[]): Project
/** Gives each record of these floors that has no anchor its sides and anchor, bound against the floors as they are. */
export function anchorUnanchoredRecords(project: Project, floorIds: readonly string[]): Project
// core/commands/room-record-binding.ts
/** Before the handler: anchorUnanchoredRecords for floors with an unanchored record. After it: rebindRoomRecords for each floor whose walls array the handler replaced. */
export function withRoomRecordBinding<P>(
  handler: CommandHandler<Project, P>,
): CommandHandler<Project, P>
export function newRoomRecordId(): string
export const ROOM_RECORD_ID_PREFIX = 'room:record:'
export const ROOM_FACES_ID_PREFIX = 'room:faces:'
// core/commands/handlers/room-commands.ts
export interface RoomTarget {
  readonly roomId: string
  readonly recordId: string // a new id when the room has no record yet
}
export function roomTarget(room: { readonly id: string; readonly recordId?: string }): RoomTarget
export function setRoomName(target: RoomTarget, name: string): Command<SetRoomNameParams>
// and setRoomCustomPolygon, setRoomPurpose, setRoomSubPurpose, setRoomPeriod, setRoomStyle,
// setRoomCeilingHeight take a RoomTarget in place of the room key
// RoomSceneNode gains recordId?: string
// core/migrations/schema/room-records.ts
export const roomRecordsMigration: SchemaMigration
```

### Cycles

- [ ] 14.1 RED: `bindRoomRecords` admits a pair with score one, or with score at least one half when
      the room holds the record's anchor (the anchor condition decided on 2026-11-23, spec 5.6 point 3);
      takes admitted pairs by score, then anchor, then larger room, then earlier record; gives at most
      one record per room; falls back to the anchor; leaves the rest unbound. One test per rule.
      `feat: bind room records to rooms by wall faces and a point`.
- [ ] 14.2 RED: a room with a record has id `room:record:<id>`, one without `room:faces:<faces>`
      (decision 9); `roomIdFromFaces` gives different ids for two face lists that differ only by side.
      The integration test "the two halves of a divided round room have different ids" needs arcs: it
      lands here if pull request 15 has merged, and otherwise in cycle 15.5.
      `feat: give rooms ids from their record or their faces`.
- [ ] 14.3 RED: `rebindRoomRecords` rewrites each bound record's faces and moves its anchor only when
      it left the room; unbound records are equal before and after; `anchorUnanchoredRecords` writes
      sides and an anchor for a side-less record against the floor as it is, and leaves an anchored
      record equal. `feat: keep bound room records current`.
- [ ] 14.4 RED in `core/commands/room-record-binding.test.ts` and a dispatcher test: a command that
      replaces a floor's `walls` runs the step inside the command, and one undo reverts both; a command
      that leaves every `walls` array the same object does not run it; with the deriver of the editor
      session's kind (`createSceneGraphDeriver`) deriving after the command, `wallNetworkBuildCount()`
      rises by exactly one for the changed floor across the command and the derivation.
      `feat: rebind room records after every wall change`.
- [ ] 14.5 RED: one test per row of spec 5.6 point 5, through commands: the divided room in two cases
      (a closet with the anchor inside: the main part keeps the record; a full partition: the anchor
      decides), and `no neighbor takes the record of a room whose outside wall was deleted` (three
      rooms under one long wall, the end room named and its neighbor unnamed: deleting the end room's
      outside wall unbinds the record and the neighbor stays unnamed; drawing a new outside wall binds
      the record again). `test:` passes after 14.4, or `fix:` for a row that fails.
- [ ] 14.6 RED: room commands take a `RoomTarget`; the first field creates a record with the target's
      id and redo gives the same id; clearing the last field removes the record; naming a room keeps it
      selected (inspector test). `feat: create and remove room records through the room commands`.
- [ ] 14.7 RED: `resolvePeriod` and `resolveStyle` find a room's override by record id.
      `feat: resolve a room's period and style from its record`.
- [ ] 14.8 RED: the migration rewrites `roomOverrides` as records (id = old key, boundary from the key
      with no side, floor from the walls, a dead key kept with no floor), every field kept; the reminder
      case of `schema-drift.test.ts` names the new version; the v17 to v19 path of every version
      fixture passes; after the migration and one edit, every room keeps its name, purpose, period,
      style, ceiling height, and custom outline. `feat: migrate room overrides to room records` (with
      `build:` for the generated files).
- [ ] 14.9 RED: a migrated document whose first edit deletes and redraws every wall of a named room
      keeps the name on the new room (the wrapper anchored the record before the handler ran); one whose
      first edit deletes the room's outside wall unbinds the record and names no neighbor.
      `feat: anchor migrated room records before their first edit`.
- [ ] 14.10 RED (fast-check): splitting any wall keeps every record on the room that holds its anchor;
      binding does not depend on wall order apart from the last tie-break. `test:` or `fix:`.

**Pins:** paint keys (wall id and side, floor id) unchanged; every room fixture's names.

**Baselines that move:** room label stories only if an id shows (expected none).

**Schema step:** the next free `schemaVersion` (19 if 13 took 18); revision 0; a fixture.

**Must not touch:** the session layer fence; `core/migrations/migrate.ts`.

**Done when:** spec 5.6 "Done when" holds; ADR-0036, ADR-0026, design spec 3.2, and the format spec
carry their changes.

**Size:** 10 cycles.

---

## Pull request 15: arc paths in the plan geometry (#80)

Spec 5.7, points 8 to 10, and 5.5 point 6. The kernel learns exact arcs: paths, intersections,
footprints, miters, rooms, and exact areas. Only tests build an arc.

**Files:** `core/geometry/wall-path.ts` (`ArcPath`), `core/geometry/tolerance.ts` (`onOneCircle`),
`core/topology/wall-graph.ts`, `wall-footprint.ts`, `junction-fill.ts`, `junction-fans.ts` (the
curvature tie-break), `rooms.ts`, `floor-plan-geometry.ts` (rings), `plan-arbitraries-test-support.ts`
(arcs), `core/index.ts`; tests beside each.

**Interfaces:**

```ts
// core/geometry/wall-path.ts
export interface ArcPath {
  readonly kind: 'arc'
  readonly start: Point
  readonly end: Point
  readonly bulge: number // 0 < |bulge| <= 1; positive curves left from start to end
}
export type WallPath = LinePath | ArcPath
export function arcPath(start: Point, end: Point, bulge: number): ArcPath // throws outside the range
export function arcRadius(path: ArcPath): number
export function arcCenter(path: ArcPath): Point
export function bulgeForRadius(
  start: Point,
  end: Point,
  radiusMm: number,
  side: 'left' | 'right',
): number // throws below half the chord
// core/topology/floor-plan-geometry.ts
export interface PlanRing {
  readonly points: readonly Point[]
  readonly bulges: readonly number[] // bulges[i] for the edge from points[i] to points[i + 1]
}
export function ringArea(ring: PlanRing): number
export function flattenRing(ring: PlanRing, maxDeviationMm: number): Point[]
// PlanRoom gains ring, clearRing, outerRing: PlanRing; its polygons are the rings flattened at 1 mm
// SetAside gains arcsDrawnStraight: readonly string[] (walls whose arc breaks the radius bound)
// core/geometry/wall-path.ts
/** The smallest centerline radius for a wall of this resolved thickness (decided on 2026-11-23: the thickness). */
export function minimumArcRadius(resolvedThicknessMm: number): number
```

### Cycles

- [ ] 15.1 RED: an arc of chord 3000 and bulge 1 has radius 1500, length 1500 pi, its middle point
      1500 mm left of the chord's middle; tangent, normal, projection, bounds, `subPath`, `offsetPath`
      (radius minus the offset on the left), `reversePath` flips the sign, `flattenPath` stays within its
      deviation. `feat: describe an arc wall's centerline`.
- [ ] 15.2 RED: `bulgeForRadius` and `arcRadius` round-trip within 1e-9 mm for radii from half the chord
      to 100 m. `feat: convert between a radius and a bulge`.
- [ ] 15.3 RED: a line meets an arc and two arcs meet at their exact points; an arc splits at a tee; the
      graph of a round room of two half-circle walls has two junctions and two edges. `feat: node arc
walls in the wall graph`.
- [ ] 15.4 RED: the footprint of an arc edge is two concentric arcs; `the miter corner lies on both
face curves` for line with arc and arc with arc, within `LENGTH_TOLERANCE_MM`; an arc that leaves
      a junction tangent to a line (within `ANGLE_TOLERANCE_RAD`) takes the offset point of the
      junction as its corner on each face; a face line that meets a face circle twice takes the point
      nearer the junction along both faces. `feat: miter arc wall footprints exactly`.
- [ ] 15.5 RED: the round room (centerline radius 1500, thickness t) has area pi (1500 - t/2)²; a bulge
      of 1e-9 gives the straight wall's rooms, footprints, and areas within the tolerance; swapped ends
      with the sign flipped give the same geometry; a tangent arc and a line leave a junction in a
      defined fan order. `feat: derive rooms bounded by arcs with exact areas`.
- [ ] 15.6 RED: two arcs on one circle that share a stretch are one edge (spec 5.5); the generators
      add arcs; the totality, invariance, splits, overlap, and corner properties run with arcs.
      `feat: treat arcs on one circle as an overlap`.
- [ ] 15.7 RED: a wall of resolved thickness 350 mm on an arc of centerline radius below
      `minimumArcRadius(350)` is drawn straight and listed in `setAside.arcsDrawnStraight`, and the
      derivation does not throw; at or above the bound it is an arc; a property over thickness and
      radius shows that every footprint of an admitted arc has an inner face of positive radius.
      `feat: draw an arc that breaks the radius bound straight`.

**Pins:** every straight-wall result unchanged (the properties of 3 and 12 hold).

**Must not touch:** the session layer fence; the model type (no `curve` field yet).

**Done when:** spec 5.7 "Done when" bullets 2, 3, 4, and the corner bullet hold in `core/`; the set-aside part of the arc bullet holds for the radius bound.

**Size:** 7 cycles.

---

## Pull request 16: arc walls in the plan and the export (#80)

Spec 5.7, point 11.

**Files:** `editor/plan/draw-plan.ts`, `draw-surface-paint.ts`, `hit-test.ts`, `hit-test-wall-face.ts`,
`snap.ts`, `core/export/svg/svg-plan-exporter.ts`, `svg-view.ts`, a plan story with an arc wall
(`editor/plan/plan-arc-wall.stories.tsx`, new).

### Cycles

- [ ] 16.1 RED: a plan geometry with an arc edge draws its fill and face lines with `arc` calls of the
      arc's center and radii (recording context). `feat: draw arc walls in the plan`.
- [ ] 16.2 RED: a hit at the arc's middle selects the wall; snapping offers the two ends and the nearest
      point on the arc. `feat: hit-test and snap arc walls`.
- [ ] 16.3 RED: the SVG of a floor with an arc edge has an `A` command with the arc's radius and sweep.
      `feat: export arc walls as arcs`.
- [ ] 16.4 RED: paint bands follow the arc faces. `feat: paint the faces of arc walls`.

**Baselines:** new plan story baseline (rendered on the CI runner).

**Must not touch:** the session layer fence.

**Done when:** the plan and the SVG draw an arc path from a test-built geometry.

**Size:** 4 cycles.

---

## Pull request 17: arc walls in three dimensions (#80)

Spec 5.7, point 12.

**Files:** `engine/scene/wall-builder.ts`, `wall-prism.ts`, `contour-tessellation.ts`,
`junction-fill-builder.ts`, `wall-surface-table.ts`, `core/scene/walk-collision.ts`.

### Cycles

- [ ] 17.1 RED: an arc edge builds one solid whose face vertices lie on radii r ± t/2 within the
      tessellation deviation. `feat: build arc walls as curved solids`.
- [ ] 17.2 RED: each curved face is one paintable face with the wall's face ids.
      `feat: keep one paintable face per side of an arc wall`.
- [ ] 17.3 RED: the fill at a line-to-arc junction closes the gap (its outline meets both footprints).
      `feat: fill junctions between lines and arcs`.
- [ ] 17.4 RED: walk collision stops at the flattened arc. `feat: collide with arc walls`.
- [ ] 17.5 RED: a test-built arc wall that hosts an opening (as a lower-revision build or a hand edit
      could write) gives the opening a span along the arc in the plan geometry, cuts no void in 3D, and
      lists the opening in `setAside.openingsOnArcs` (a new field); nothing throws.
      `feat: keep a stored opening on an arc wall without cutting it`.

**Baselines:** none yet (the scene baseline lands in 18).

**Must not touch:** the session layer fence.

**Done when:** the 3D view builds an arc path from a test-built geometry.

**Size:** 5 cycles.

---

## Pull request 18: bend a wall into an arc (#80, #687)

Spec 5.7, points 1 to 7 and 13 to 19. The stored field, the command, the bend handle, and the Radius
field: the arc reaches users.

**Files:** core: `core/model/types.ts` (`Wall.curve`), `core/model/factories.ts` (revision + 1),
`core/geometry/wall-path.ts` (`wallPath` reads `curve`), `core/commands/handlers/wall-commands.ts` and
`opening-commands.ts` (shared), `core/commands/testing/` samples (shared), `core/index.ts`; generated:
`schema/<version>/revision-<R>/vernacular.schema.json`, `known-keys.json`, `core/format/generated/*`,
`tests/format/schema-drift.test.ts` (the reminder case);
editor: `editor/plan/wall-bend-handle.ts` (new), `editor/plan/use-wall-editing.ts` (shared),
`editor/plan/wall-radius-editor.tsx` (new) and its story, `editor/plan/wall-length-editor.tsx` (arc:
read only), `editor/plan/length-field.tsx` (a read-only state if needed), `editor/shell/inspector.tsx`,
the opening tool's wall filter (`editor/plan/place-opening.ts`); harness: one arc scene in
`bridge/react/harness-fixtures.ts` and its name in `app/harness-environment.ts` (the one `app/` edit
of the stage); e2e: `e2e/tests/journeys/bend-wall.spec.ts`, the scene baseline under
`e2e/tests/scene-visual-regression.spec.ts-snapshots/`.

**Interfaces:**

```ts
// core/model/types.ts
export interface WallCurve {
  readonly kind: 'arc'
  readonly bulge: number
}
// Wall gains curve?: WallCurve
// core/commands/handlers/wall-commands.ts
export const SET_WALL_CURVE = 'floor/set-wall-curve'
export interface SetWallCurveParams {
  readonly floorId: string
  readonly wallId: string
  readonly curve: WallCurve | undefined
}
export function setWallCurve(
  floorId: string,
  wallId: string,
  curve: WallCurve | undefined,
): Command<SetWallCurveParams>
// editor/plan/wall-bend-handle.ts
/** The bulge for a handle dragged to `pointer`: clamped to [-1, 1], 0 within `snapToStraightMm` of the chord. */
export function bulgeForHandle(
  start: Point,
  end: Point,
  pointer: Point,
  snapToStraightMm: number,
): number
export function bendHandlePoint(path: WallPath): Point
```

### Cycles

- [ ] 18.1 RED in `tests/format/` (the reminder case of `schema-drift.test.ts` names the new revision in
      this RED) and `core/geometry/wall-path.test.ts`: a wall with `curve` saves,
      loads, and is equal; the file passes the schema of the new revision; `wallPath` of it is an
      `ArcPath`; a build at a lower revision reads it tolerantly and reports a newer build.
      `feat: store a wall's curve as a bulge` (with `build:` for the schema).
- [ ] 18.2 RED: `setWallCurve` sets and clears the curve in one undo step; it throws (and rolls back) for
      a wall that hosts an opening or a bulge outside [-1, 1]; `placeOpening` on an arc wall throws.
      `feat: set and clear a wall's curve`.
- [ ] 18.3 RED: `bulgeForHandle` clamps at a half circle and returns 0 near the chord;
      `bendHandlePoint` is the path's middle. `feat: map the bend handle to a bulge`.
- [ ] 18.4 RED: dragging the handle of a selected straight wall dispatches one `setWallCurve` on
      release, keeps the wall's id, junctions, paint, and room record; the handle does not show on a wall
      with an opening. `feat: bend a selected wall with its middle handle`.
- [ ] 18.5 RED: the Radius field shows the radius of an arc wall and is empty for a straight one; a typed
      radius reads back as typed; a radius below half the wall is refused with a reason; clearing it
      straightens the wall; the Length field of an arc wall shows the arc length and takes no input.
      `feat: add a Radius field for arc walls`.
- [ ] 18.6 RED: the opening tool does not offer an arc wall. `feat: keep openings off arc walls`.
- [ ] 18.6a RED: the bend handle stops at `minimumArcRadius` of the wall's resolved thickness; the
      Radius field refuses a smaller radius with "The radius must be at least the wall's thickness.";
      `setWallThickness` throws (and rolls back) for an arc wall when the new thickness would break the
      bound. `feat: keep arc walls above the smallest radius`.
- [ ] 18.7 RED: the arc harness scene renders with a ready signal; the scene holds a line-to-arc
      corner on an arc whose radius is within 10 percent of the bound; the scene baseline is new.
      `feat: add an arc wall scene to the harness`.
- [ ] Journey: `test(e2e): bend a wall, see it in plan and 3D, save, reload, and see it again`.

**Baselines:** new scene baseline (arc), new Radius field story; the plan story of 16 unchanged.

**Schema step:** the next free `schemaRevision` of the current version (1 of 19 if nothing else took
it). Check the number before the merge; any revision for the view from the front that merged first takes the lower
number.

**Must not touch:** the session layer fence (except the one entry in `app/harness-environment.ts`).

**Done when:** spec 5.7 "Done when" holds in full; every "Done when" list of the spec holds; ADR-0047
and the format spec 6.5 mark `wall.curve` as defined; the kernel line of #682 can be ticked.

**Size:** 8 cycles and one journey.
