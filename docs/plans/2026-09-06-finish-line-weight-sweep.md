# Finish the plan-canvas line-weight sweep

Closes the sweep ADR-0159 deferred to issue #524: the remaining `ctx.lineWidth` literals in
`editor/plan/` production draw code start reading from `editor/plan/plan-ink.ts` instead of
carrying their own numbers.

## Constraint

Pure refactor. Every effective width stays byte-for-byte what it is today. No literal is
"corrected" on the way through, even where the current value looks like an emphasis inversion.
Anything that looks wrong gets reported, not changed.

## What the ink module gains

`plan-ink.ts` today exports `PlanInkRole` and `PLAN_INK_WIDTH` (`cut: 2.5`, `fixture: 1.5`,
`annotation: 1`). Three named quantities are added so the remaining literals have something to
derive from:

| New export                            | Value                                                 | Meaning                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN_INK_EMPHASIS`                   | `1`                                                   | How much heavier a highlight draws than the ink it marks. Already the implicit `+ 1` in three derived constants (ADR-0159 dec. 3). |
| `PLAN_INK_OVERLAY_WIDTH`              | `PLAN_INK_WIDTH.annotation + PLAN_INK_EMPHASIS` = `2` | The weight of a transient interaction overlay: the wall-draw preview, snap marker, move ghost, calibration line, paint accent.     |
| `PLAN_INK_FIXTURE_SELECTION_EMPHASIS` | `PLAN_INK_EMPHASIS / 2` = `0.5`                       | The lighter step the furniture and stair selection outlines draw with today. Named so the deviation is visible, not silently lost. |

`PLAN_INK_OVERLAY_WIDTH` earns its place by collecting five constants that are all `2` today for
the same reason: they mark something provisional, so they read over the grid and the annotation
layer without claiming the cut plane's weight.

`PLAN_INK_FIXTURE_SELECTION_EMPHASIS` exists because the furniture and stair selection outlines
sit at `2` while their ink is `fixture` (`1.5`). That is half a step, not the full emphasis step
the other selection cues use. Deriving them from `fixture` keeps the cue tied to the ink it
emphasizes (so a `fixture` retune still moves them) while preserving today's exact `2`.

## Derivation table

| File                    | Constant                     | Today     | New expression                                                 | Value |
| ----------------------- | ---------------------------- | --------- | -------------------------------------------------------------- | ----- |
| `draw-plan.ts`          | `GRID_LINE_WIDTH`            | `1`       | `PLAN_INK_WIDTH.annotation`                                    | 1     |
| `draw-plan.ts`          | `MARQUEE_LINE_WIDTH`         | `1`       | `PLAN_INK_WIDTH.annotation`                                    | 1     |
| `draw-plan.ts`          | `PREVIEW_LINE_WIDTH`         | `2`       | `PLAN_INK_OVERLAY_WIDTH`                                       | 2     |
| `draw-plan.ts`          | `SNAP_MARKER_LINE_WIDTH`     | `2`       | `PLAN_INK_OVERLAY_WIDTH`                                       | 2     |
| `draw-plan.ts`          | `SELECTED_ROOM_LINE_WIDTH`   | `cut + 1` | `PLAN_INK_WIDTH.cut + PLAN_INK_EMPHASIS`                       | 3.5   |
| `draw-plan.ts`          | `HOVER_HIGHLIGHT_LINE_WIDTH` | `cut + 1` | `PLAN_INK_WIDTH.cut + PLAN_INK_EMPHASIS`                       | 3.5   |
| `draw-ghost.ts`         | `GHOST_LINE_WIDTH`           | `2`       | `PLAN_INK_OVERLAY_WIDTH`                                       | 2     |
| `draw-underlay.ts`      | `CALIBRATION_LINE_WIDTH`     | `2`       | `PLAN_INK_OVERLAY_WIDTH`                                       | 2     |
| `draw-surface-paint.ts` | `ACTIVE_HIGHLIGHT_WIDTH`     | `2`       | `PLAN_INK_OVERLAY_WIDTH`                                       | 2     |
| `draw-surface-paint.ts` | `BAND_LINE_WIDTH`            | `3`       | `ACTIVE_HIGHLIGHT_WIDTH + PLAN_INK_EMPHASIS`                   | 3     |
| `draw-surface-paint.ts` | `HIGHLIGHT_BAND_WIDTH`       | `4`       | `BAND_LINE_WIDTH + PLAN_INK_EMPHASIS`                          | 4     |
| `draw-dimension.ts`     | `DIMENSION_SELECTION_WIDTH`  | `2`       | `PLAN_INK_WIDTH.annotation + PLAN_INK_EMPHASIS`                | 2     |
| `draw-furniture.ts`     | `FURNITURE_SELECTION_WIDTH`  | `2`       | `PLAN_INK_WIDTH.fixture + PLAN_INK_FIXTURE_SELECTION_EMPHASIS` | 2     |
| `draw-stair.ts`         | `STAIR_SELECTION_WIDTH`      | `2`       | `PLAN_INK_WIDTH.fixture + PLAN_INK_FIXTURE_SELECTION_EMPHASIS` | 2     |
| `draw-opening.ts`       | `OPENING_SELECTION_WIDTH`    | `cut + 1` | `PLAN_INK_WIDTH.cut + PLAN_INK_EMPHASIS`                       | 3.5   |

The surface-paint trio reads as a ladder: the accent centerline sits over the plan ink, the
painted band over the centerline, the highlighted-face band over the painted band, each one
emphasis step heavier than the stroke it must read over. That matches what the existing comments
already claim ("thicker than the paint band so it reads on top") and lands on 2, 3, 4 exactly.

Three constants already derive from the table and change only in that their bare `+ 1` becomes
`+ PLAN_INK_EMPHASIS`: `SELECTED_ROOM_LINE_WIDTH`, `HOVER_HIGHLIGHT_LINE_WIDTH`, and
`OPENING_SELECTION_WIDTH`. That is deliberate scope: leaving three copies of an unnamed `1`
behind while naming the same step everywhere else would defeat the point of the sweep. No value
moves.

Untouched, because they already derive and have nothing left to name: `OPENING_INK_WIDTH`,
`OPENING_SYMBOL_INK_WIDTH`, `DIMENSION_INK_WIDTH`, `FURNITURE_INK_WIDTH`, `STAIR_INK_WIDTH`,
`WALL_FACE_LINE_WIDTH`.

## Observations to report, not fix

- The furniture and stair selection outlines (`2`) clear their `fixture` ink (`1.5`) by half a
  step, where every other selection cue clears its ink by a full step. Raising them to `2.5`
  would be a visual change, so the sweep names the half step instead.
- The wall-draw preview (`2`) reads lighter than the `cut` ink (`2.5`) of the wall it becomes.
  Plausibly deliberate (provisional geometry should not read as built), so it stays at 2 and is
  expressed as an overlay rather than as a `cut` derivative.

## Commit sequence

`pnpm rgb:audit` classifies `test:` as RED, `feat:`/`fix:` as GREEN, `refactor:` as BLUE, and
everything else as exempt. It only raises violations against GREEN commits, so a lane of
alternating RED and BLUE commits with no GREEN is clean. The characterization tests are RED and
each derivation swap is the BLUE that follows it.

1. `docs: plan the line-weight sweep completion`
2. `test: pin the grid, marquee, preview, and snap-marker line widths`
3. `refactor: derive the draw-plan line widths from the ink table`
4. `test: pin the ghost and calibration line widths`
5. `refactor: derive the ghost and calibration widths from the ink table`
6. `test: pin the surface-paint band and highlight widths`
7. `refactor: derive the surface-paint widths from the ink table`
8. `test: pin the dimension, furniture, and stair selection widths`
9. `refactor: derive the selection widths from the ink table`

Step 2 also asserts `PLAN_INK_EMPHASIS` and `PLAN_INK_OVERLAY_WIDTH` in `plan-ink.test.ts`, and
step 8 asserts `PLAN_INK_FIXTURE_SELECTION_EMPHASIS`; those assertions fail until the refactor
that introduces each constant lands, which is the normal RED-then-passing shape.

## How the tests pin widths

The module constants are private, so each test drives the real draw function against the
`recordingContext()` fake from `draw-plan-test-fixtures.ts` and reads `recorder.ctx.lineWidth`
after the call, the pattern `draw-opening.test.ts` and `draw-stair.test.ts` already use. Each
case is set up so the width under test is the last one the draw call sets. Expectations are
written as bare numbers (`toBe(2)`), not as ink-table expressions, so they keep pinning pixels
after the derivation lands rather than restating it.

`drawGhost` has no colocated test file today, so step 4 adds `editor/plan/draw-ghost.test.ts`.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, and
`pnpm rgb:audit origin/main..HEAD`, each checked for its own exit code. Then
`pnpm exec playwright test e2e/tests/visual-regression.spec.ts` against a fresh preview build:
every snapshot must pass unchanged, since a changed width would move pixels.
