# Break the wall stroke at openings

Issue #521. Finishes the geometric break ADR-0160 started and retires the painted gap that
ADR-0159 recorded as a known compromise.

## Where this stands today

ADR-0160 decision 4 already cuts openings out of the wall symbol. Each opening projects onto its
host graph edge as a span of centerline distances, and `wallFaceGeometry` returns one poche ring
and one face-line pair per standing stretch. A wall with a door in the middle therefore fills two
polygons and strokes four face lines, with nothing drawn across the door.

What the same decision left behind is the older workaround. `drawGapAndJambs` in
`editor/plan/draw-opening.ts` still fills the opening footprint in `palette.roomFill` before it
strokes the jamb caps. That fill was how the wall stroke used to be broken, back when a wall drew
as one thick centerline stroke with no interior to interrupt. One opaque color can only match one
backdrop. On an exterior wall it matches the interior room on the inside half of the thickness and
paints a pale tab over the canvas on the outside half. In a room with a floor paint override it
mismatches on the inside too.

## What changes

### 1. The opening stops painting over the plan

The footprint fill goes. `drawGapAndJambs` becomes `drawJambCaps` and does what its name says:
stroke a cap across the wall at each jamb, at `PLAN_INK_WIDTH.cut` in the palette wall ink, per
ADR-0159 decision 2. The `gapFill` field goes off `OpeningPainter` with it.

Nothing replaces the fill. The break is already geometric, so an opening paints only the ink a
plan reader expects: two jamb caps, the family symbol, a curved head where the element type has
one, and a selection highlight when selected. Whatever the canvas already drew under the opening,
grid lines, an underlay photo, a stair tread, a room fill, survives on both sides of the wall.

### 2. The painted face bands break at the same jambs

Removing the fill exposes one layer that was relying on it. `drawSurfacePaint` strokes a wall
face's finish as a band offset half a thickness from the centerline, and that band runs the whole
wall from end to end. Until now the opening's fill painted over the part of it that crossed a
doorway. Without the fill, a painted wall would show its finish band running straight through the
door.

So the bands break too, at the same spans. The band on one side of a wall is geometrically the
same thing as a face line: a segment parallel to the centerline at a half-thickness offset, cut
square at each jamb. That is exactly what `wallFaceGeometry` computes, so the band routine
composes it rather than repeating the span algebra:

```
wallFaceGeometry({
  start: wall.start,
  end: wall.end,
  corners: { aPlus: leftBand.from, bPlus: leftBand.to, aMinus: rightBand.from, bMinus: rightBand.to },
  gaps: openingSpansAlong(wall, openings),
})
```

The corners handed in are the square offsets `offsetBand` already computes from the wall's own
endpoints, so each returned stretch carries the left band sub-segment as `plusFace` and the right
one as `minusFace`. A wall with no openings yields a single stretch whose faces are the band
endpoints the routine draws today, so nothing moves on an unbroken wall.

The bands take their offsets from the wall's own endpoints rather than from the mitred corners the
face lines use. That mismatch at a non-collinear junction is issue #547 and is left alone here.

The accent centerline that marks the active paint target keeps running the full wall. It is not
ink on a face; it says which wall is being painted, and a wall with a door in it is still one
wall.

### 3. One projection, shared

Both wall layers now need the same answer to the same question: where does an opening cut this
wall. `draw-plan.ts` already has `openingGapsAlong`, which filters the openings by `hostWallId`
and projects each jamb onto the wall axis with `projectPointOntoWall`. That moves to a new
`editor/plan/opening-spans.ts` and both callers read it.

The two callers pass different runs. `drawableWallEdges` passes a graph edge, so an opening on
another sub-edge of a teed wall projects outside the run and clamps away inside
`wallFaceGeometry`. The paint layer passes the authored wall, so every opening on it lands in
range. Both cases fall out of the same helper because the clamping lives downstream.

## What stays put

- Every line weight. Jamb caps stay at `PLAN_INK_WIDTH.cut`, symbol strokes at
  `PLAN_INK_WIDTH.annotation`, the selection highlight at `cut` plus one emphasis step, the paint
  band at three pixels and the highlighted-face band at four.
- Every color. The jamb caps and symbols still ink in `palette.wall`, the poche still fills in
  `palette.poche`, a band still strokes in its treatment color.
- The poche and face-line geometry. `drawableWallEdges`, `drawWallPoche`, and `drawWallFaces` are
  untouched apart from the extracted projection helper.
- The layer order in `drawPlan`.

## Out of scope

The SVG plan export (`core/export/svg/`) paints its own opening gap the same way the canvas did.
That is a `core/` change with its own tests and its own export baselines, so it stays for a
follow-up.

## Commit sequence

`pnpm rgb:audit` reads `test:` as RED, `feat:` and `fix:` as GREEN, `refactor:` as BLUE, and
everything else as exempt. Every GREEN is closed by a BLUE before the next RED.

1. `docs: plan the geometric wall-stroke break at openings`
2. `test: expect an opening to leave the plan beneath it unpainted`
3. `fix: break the wall at an opening without painting over the plan`
4. `refactor: name the opening wall break for the jamb caps it draws`
5. `test: expect a painted face band to stop at each opening jamb`
6. `fix: break the surface-paint face bands at opening jambs`
7. `refactor: share one opening-span projection across the wall layers`
8. `docs: record the retired gap fill in the wall poche decision`

Step 2 also rewrites the two cases in `draw-opening.test.ts` that assert the fill, since the
behavior they pin is the behavior being removed. Step 8 amends ADR-0160 with a dated update
section and bumps its `updated:` date.

## How the tests read the canvas

The `recordingContext()` fake from `draw-plan-test-fixtures.ts` records fill styles, stroke
styles, and segment endpoints, so a case can assert what was painted without a real canvas.

- A cased opening draws only the wall break, no leaf and no arc, so `recorder.fills` is the whole
  answer for whether an opening paints over anything. It must be empty.
- The jamb caps are checked by their endpoints: each runs across the wall at a jamb, from
  `jamb - normal * hostThickness / 2` to `jamb + normal * hostThickness / 2`, in `palette.wall`.
- At the `drawPlan` level, a plan with a wall and an opening but no rooms must record no fill in
  `palette.roomFill`. That is the exterior-wall defect stated as an assertion.
- A painted wall with a centered opening records two band segments per painted side instead of
  one, and neither runs the full length of the band.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, and
`pnpm rgb:audit origin/main..HEAD`, each checked for its own exit code. Then
`pnpm exec playwright test e2e/tests/visual-regression.spec.ts` against a fresh preview build. No
committed 2D baseline renders a wall with an opening today, so those snapshots should pass
unchanged; a failure gets reported rather than refreshed.
